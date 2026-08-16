# クラスレベルの`Roles`メタデータが無視される問題のデバッグ記録

## 対象の不具合

`AdminReportsController`へ`@Roles(Role.Admin)`を付け、`RolesGuard`もControllerへ適用していました。しかし、memberが`GET /admin/reports/monthly-2026-08`を呼ぶとHTTP 200でレポートを取得でき、ハンドラー内の監査サービスにも到達しました。memberは403で拒否され、監査レコードを残さないことが契約です。

| 観測点 | 期待値 | バグ状態の実際値 |
| --- | --- | --- |
| memberのHTTP応答 | 403 | 200 |
| member要求後の監査状態 | 空配列 | memberの到達レコード1件 |
| adminのHTTP応答 | 200とレポートJSON | 200とレポートJSON |
| admin要求後の監査状態 | adminの到達レコード1件 | adminの到達レコード1件 |

## 再現条件

バグ状態のコミットは`d217627`です。

```bash
git checkout d217627
npm ci
npm run test:repro
npm run build
```

最初のテストはmember要求の境界応答を、二つ目のテストは別の読み取り経路である`ReportAuditService.all()`を確認します。実測結果は次の通りです。

```text
expected 403 "Forbidden", got 200 "OK"

Expected: []
Received: [{
  role: "member",
  reportId: "monthly-2026-08"
}]
```

同じバグ状態で`npm run build`は成功しました。問題は型検査ではなく、Guardがどのメタデータのターゲットを読むかという実行時の認可判定です。

## 調査

| 確認対象 | 観測結果 | 判断 |
| --- | --- | --- |
| 入力 | memberは`x-role: member`、adminは`x-role: admin`を送る | ロール入力は区別されている |
| HTTP境界 | memberが200、adminが200 | memberの拒否だけが壊れている |
| 監査状態 | member要求後にもレコードが残る | Guardがハンドラー実行前に止めていない |
| Controller設定 | クラスへ`@Roles(Role.Admin)`と`@UseGuards(RolesGuard)`を設定 | ロール制約の宣言は存在する |
| Guard実装 | `Reflector.get(ROLES_KEY, context.getHandler())`だけを呼ぶ | クラスのメタデータを探索していない |
| 公式仕様 | クラスのメタデータは`context.getClass()`から取得し、上書きには`getAllAndOverride()`を使う | 実装上の不足を裏付ける |

デバッガーは使いませんでした。memberとadminの入力、Controller設定、Guardのメタデータ参照先、HTTP応答、監査状態を比較し、Guardのターゲット配列だけを変更すると結果が反転する最小実験で原因を確定できたためです。

## 原因

バグ状態のGuardは、メタデータを現在のハンドラーだけから取得していました。

```ts
const requiredRoles = this.reflector.get<Role[]>(
  ROLES_KEY,
  context.getHandler(),
);
```

`@Roles(Role.Admin)`はControllerクラスに付いているため、`context.getHandler()`だけをターゲットにすると`requiredRoles`は`undefined`です。その結果、Guardはロール制約がないと判定して`true`を返し、memberをハンドラーへ通します。

NestJSの`ExecutionContext`は`getHandler()`と`getClass()`の両方を提供します。公式ドキュメントは、クラスレベルのメタデータを読むには`context.getClass()`を渡すこと、クラスの既定ロールをメソッドで上書きする設計には`getAllAndOverride()`を使うことを説明しています。[NestJS Execution context](https://docs.nestjs.com/fundamentals/execution-context) また、Guardが`false`を返すとNestJSは要求を拒否します。[NestJS Guards](https://docs.nestjs.com/guards)

## 修正

修正コミットは`1099342`です。Guardの取得方法だけを変更しました。

```ts
const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
  ROLES_KEY,
  [context.getHandler(), context.getClass()],
);
```

この配列順により、メソッドのメタデータがあるときはそれを優先し、ないときはControllerクラスの`@Roles(Role.Admin)`を適用します。NestJSの認可ドキュメントにも、`RolesGuard`で同じ二つのターゲットを`getAllAndOverride()`へ渡す例があります。[NestJS Authorization](https://docs.nestjs.com/security/authorization)

## 回帰確認

```bash
git checkout main
npm ci
npm run test:repro
npm test
npm run build
```

実測結果は、焦点化テスト3件成功、全テスト3件成功、TypeScriptビルド成功でした。

| ケース | 確認する契約 | 実測結果 |
| --- | --- | --- |
| memberの要求 | 403で拒否する | 成功 |
| member要求後の監査 | 空配列のまま | 成功 |
| adminの要求 | 200でレポートを返す | 成功 |
| admin要求後の監査 | adminの到達記録1件 | 成功 |
| TypeScriptビルド | 本番コードをコンパイルできる | 成功 |

## 設計上の制約

このサンプルの`x-role`はテストを小さく保つための代替入力です。本番の認可では、クライアントが任意に送れるヘッダーをロール情報として信頼してはいけません。認証済みユーザーからロールを確定し、リソース単位の権限、テナント境界、監査ログの保持期間を別途設計します。

また、`getAllAndOverride()`はクラス既定値をメソッドで置き換えたい場合の選択です。クラスとメソッドの両方のロールを累積して必要とするポリシーでは、`getAllAndMerge()`と明示的な論理演算を検討します。[NestJS Execution context](https://docs.nestjs.com/fundamentals/execution-context)

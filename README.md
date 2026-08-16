# NestJS RolesGuard: クラスレベルのRolesメタデータが無視される再現

このプロジェクトは、NestJSのカスタム`RolesGuard`が`context.getHandler()`のメタデータだけを読むため、Controllerクラスに付けた`@Roles(Role.Admin)`を無視し、memberが管理レポートを取得できる問題を再現します。

## 守るAPI契約

| HTTPリクエスト | 期待する境界結果 | 監査状態 |
| --- | --- | --- |
| `GET /admin/reports/monthly-2026-08`、`x-role: member` | `403 Forbidden` | 監査レコードを作らない |
| `GET /admin/reports/monthly-2026-08`、`x-role: admin` | `200 OK`とレポートJSON | adminの監査レコードを1件作る |

NestJSの公式ドキュメントは、ハンドラーとControllerクラスの両方にロールメタデータを設定でき、既定値をクラスで定義してメソッドで上書きする場合は`Reflector.getAllAndOverride()`へ`context.getHandler()`と`context.getClass()`を渡す方法を示しています。[NestJS Execution context](https://docs.nestjs.com/fundamentals/execution-context)

## 前提条件

Node.js 22以上とnpmが必要です。

```bash
npm ci
```

## バグを再現する

バグを含むコミットでは、memberの要求がHTTP 200となり、管理レポートに到達した監査レコードも作られます。

```bash
git checkout d217627
npm ci
npm run test:repro
```

実測した失敗結果は[`evidence/bug-test.txt`](./evidence/bug-test.txt)に保存しています。

```text
expected 403 "Forbidden", got 200 "OK"
Expected: []
Received: [{ role: "member", reportId: "monthly-2026-08" }]
```

## 最小修正

修正では、`RolesGuard`のメタデータ取得を、ハンドラーだけを読む`Reflector.get()`から、ハンドラーとControllerクラスを優先順位付きで読む`getAllAndOverride()`へ置き換えます。

```ts
const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
  ROLES_KEY,
  [context.getHandler(), context.getClass()],
);
```

```bash
git checkout 1099342
npm ci
npm run test:repro
npm test
npm run build
```

修正後の焦点化テスト結果は[`evidence/fixed-test.txt`](./evidence/fixed-test.txt)、全体確認結果は[`evidence/full-verification.txt`](./evidence/full-verification.txt)にあります。

## デバッグ記録

入力、HTTP境界、監査状態、Guard実装、公式仕様を分けた観測は[`docs/debugging-record.md`](./docs/debugging-record.md)に記録しています。

## 制約

このサンプルは`x-role`ヘッダーをテスト用の認証済みロールとして扱います。実運用では、ロール値をクライアント任意のヘッダーから信頼してはいけません。認証済みのアイデンティティからロールを確定し、機微な操作はロール確認に加えてリソース単位の認可・監査設計を行う必要があります。

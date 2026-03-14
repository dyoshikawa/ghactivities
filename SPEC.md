# ghevents

## 仕様

ユーザーのGitHubアカウントに関するあらゆるイベント（Issue起票、Issueコメント、Discussion作成、Discussionコメント、プルリクエスト作成、プルリクエストコメント、Commit）を取得するCLIツール。
jsonファイルで出力する。

### コマンド

#### npx ghevents

デフォルトでは、Publicリポジトリにおける直近2週間のイベントを取得し、JSONファイル `./ghevents.json` を出力する。

オプション:

- --github-token: GitHubのアクセストークンを指定する。省略時は環境変数 `GITHUB_TOKEN` もしくは `gh auth token` の結果を参照する。
- --output: 出力ファイル名を指定する。省略時は `./ghevents.json` を使用する。
- --since: 取得するイベントの開始日時をISO8601形式で指定する。省略時は2週間前の日付を使用する。
- --until: 取得するイベントの終了日時をISO8601形式で指定する。省略時は現在日時を使用する。
- --visibility: 取得するリポジトリの可視性を指定する。`public`（デフォルト）、`private`、`all` のいずれかを指定する。
- --max-length-size: 出力するJSONファイルの最大サイズを指定する（1B,2K,2Mなど）。省略時は1MB以内。超えたらファイルを分割する。 `./ghevents_1.json`, `./ghevents_2.json` のように出力する。
- --order: 取得するイベントの順序を指定する。`asc`（デフォルト）または `desc` のいずれかを指定する。

## 技術選定

- Go
- Go Modules
- GitHub GraphQL API
- Go標準CLI/テスト/ビルドツールチェーン

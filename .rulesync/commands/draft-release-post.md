---
targets:
  - "*"
description: リリース告知のXポスト下書きを作成する
---

# リリース告知Xポスト下書き作成

リリースバージョンまたはリリースURLを受け取り、ghactivitiesのリリース告知用Xポストの下書きを作成して出力する。

## 入力

$ARGUMENTS にリリースバージョン（例: `v1.2.0`）またはGitHubリリースURL（例: `https://github.com/dyoshikawa/ghactivities/releases/tag/v1.2.0`）が渡される。複数のリリースが渡される場合もある（その場合は1つのXポストにまとめる）。

## 手順

1. **リリース情報の取得**: 渡されたバージョンまたはURLから、GitHubリリースノートの内容を取得する。`gh release view <version>` コマンドを使用する。
2. **貢献者のXアカウント調査**: リリースノートに記載されている各貢献者について、以下の手順でXアカウントを探す:
   - `gh api users/<username>` でGitHubプロフィールを取得し、`twitter_username` フィールドを確認する。
   - Xアカウントが見つかった場合は `@アカウント名` 形式で記載する。
   - 見つからなかった場合はGitHubアカウント名をそのまま記載し、「（Xアカウントがわからなかった）」と補足する。
3. **関連ツール/サービスのXアカウント調査**: リリース内容に含まれるツールやサービスの公式Xアカウントも可能な範囲で調べ、メンション形式で含める。
4. **Xポストの下書き作成**: 以下のフォーマットに従って日本語でXポストの下書きを作成する。

## フォーマット

以下の例を参考に、同じスタイル・トーンで作成すること。

### ポスト例1

```
ghactivities v1.2.0をリリースしました！

- 出力をトークン数で分割する --max-tokens オプションを追加。
Contributor: dyoshikawa

大きなGitHubアクティビティのJSONを、LLMのコンテキストサイズに合わせて分割できるようになりました。

Thank you for the contributors!
```

### ポスト例2

```
ghactivities v1.1.0をリリースしました！

- Discussion / DiscussionComment の収集に対応。Contributor: dyoshikawa
- 出力ファイルサイズによる分割（--max-length-size）を追加。Contributor: dyoshikawa

GitHub上での自分の活動（Issue, PR, Commit, Discussionなど）をまとめてJSONに書き出せるCLIツールです。振り返りや実績まとめにどうぞ。

Thank you for the contributors!
```

## ポスト構成のルール

1. **1行目**: `ghactivities <version>をリリースしました！`（複数バージョンの場合はまとめて記載）
2. **変更点リスト**: 各変更を箇条書きで記載。各項目にContributorを添える。ツール名に公式Xアカウントがあればメンション形式で含める。
3. **補足コメント**: 注目すべき変更点や貢献者について、カジュアルなトーンで補足する。
4. **締め**: `Thank you for the contributors!` で締める。
5. **言語**: 日本語で記載する（最後の締めの一文は英語）。

## 出力

完成した下書きをそのままコピーペーストできる形で出力する。

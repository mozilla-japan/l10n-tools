# L10n Tools for Mozilla Japanese L10n

Gecko エンジンと Mozilla 製品の日本語ローカライズに使用するスクリプトです。
昔の複雑かつ遅かった Ant スクリプトから必要機能だけ抜き出して置き換えます。

## 使い方
en-US と ja のファイル取得と convert まで実装。言語間のリソース比較やエラーチェックなどはまたいずれ。

```
// Node モジュールをインストール
npm install
// moz/comm-central の en-US ロケールファイルを取得
gulp get-en-US
gulp get-en-US --channel=aurora
gulp get-en-US --channel=beta
gulp get-en-US --channel=release
// 日本語用の gecko-l10n リポジトリを clone または pull
gulp get-ja
// gecko-l10n/ja から nightly/ja, nightly/ja-JP-mac を生成
gulp convert
gulp convert --locale=ja-JP-mac
```

## ファイルとディレクトリ
* config.json: 初期設定、リポジトリ URL、moz/comm-central と gecko-l10n のディレクトリ対応関係などを定義
* gulpfile.js: Gulp スクリプト本体
* package.json: Node モジュール依存関係の定義
* replace.json: @@VERNAME@@ を ja,ja-JP-mac に置き換える (主にバージョン非依存の) 変数置き換えフィルタの定義
* nightly,aurora,beta,release: 各チャンネルの言語リソースファイル
  * en-US: 英語版を moz/comm-central から取得して gecko-l10n 
  * ja: gecko-l10n から生成した ja ロケール専用ファイル
  * ja-JP-mac: gecko-l10n から生成した ja-JP-mac ロケール専用ファイル
* gecko-l10n: [元の日本語リソースファイル](https://github.com/mozilla-japan/gecko-l10n)を clone したもの
  * ja: このディレクトリのファイルの @@VERNAME@@ を置き換えて ja,ja-JP-mac それぞれのファイルを生成
  * ja.filters: @@VERNAME@@ を ja,ja-JP-mac に置き換える (主にバージョン依存の) 変数置き換えフィルタの定義
* node_modules: npm install で Node モジュールをローカルインストール

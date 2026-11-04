---
name: petty-cash-copy
description: 「2026年10月」のように年月を指示されたら、各店舗の小口(petty cash)フォルダからその月の写真・PDFを特定し、保管先フォルダの店舗別・年別フォルダへコピーする。
---

# 小口 月次コピー

起動: ユーザーが「YYYY年M月」(例: 2026年10月)と指示したとき。

## 対象ファイル
- 写真(image/*)とPDFのみコピーする。Excel・スプレッドシートはコピーしない。

## フォルダ一覧
保管先ルート: `1J6q3xqXK_9uvhcl8uhmUv0QKhgoa9rJD`
保管先には店舗フォルダがあり、その下に年フォルダ(`2026`など)がある。

| 店舗 | 元フォルダID | 保管先 店舗フォルダID |
|---|---|---|
| ビールと羊 | 1S6mcwZsmLtBaTNiCAWs-TLsgawnclX2m | 1gr0GMiC5kqd05wWR4mcPEwfpKAESkiOT |
| ダーツ | 1S-cMbvOYrHYlVO_NQD0eDR16tsvDzORy | 1ct6-JXAy6uKqoLWA4n0fl8YR-E53livR |
| フィーノ | 1STHKueawd9-4fpbhrPzz4vC4dkCzjAaM | 134mYyLUU9sURMYe5NNo1ZPkNgRlAQX3K |
| ゴルフ | (リンク未提供。スキップして報告) | 1MOJkUyjYpSgshaDBDzBCDcWyaxh_-IVm |
| 宝来 | 1PDQDdFbzTCLkYyAVJybUun8e7IN-IQFA | 1eZ2ItcfD_pa0jsKZDTy4UPigjkEnfNs9 |
| 生駒 | 1hC7QcUpbHLtzRJgbgD8w3dcBnHC4pV2B | 1-87BwtXVPCtTENz4iXND9AL563zKzORW |
| 木津 | 1Axe_5BX74WC4znXKuaw75wsMWKPNOkyk | 1QCnU5bzY_MfqvEJlzs7XGvr4owxZR5lH |
| 本社 | 0B2BdMWp9r8K4cXhXakJGTXF4RGs | 1gqqkAyoJv7dQ5kBf_MPju_ukxsmliDTA |

## 元フォルダで対象月を特定する方法
店舗ごとに名前の形式が違う。次のようなフォルダを「その月」として扱う。
- `現金出納帳（店名）2026.10月分`(ビールと羊)
- `プラフィーノカフェ　2026年10月`(フィーノ)
- `2026年10月分レシート` / `2026年10月レシート`(宝来・生駒・木津)
- `2026.10`(ダーツ)
- 本社: 元フォルダ直下の年フォルダ`2026`(ID 1V01ieBDuwDgRcxPCvQa_MNpqS8YWqLsT)の中の`2610領収書`(YYMM+領収書)

見つからない店舗は推測せず、「見つからない」と報告する。

## 保管先の置き場所
1. 保管先 店舗フォルダの直下に、年フォルダ(`2026`)があるか確認する。なければ作る(年度ごとに作る)。
2. 年フォルダの中に、元と同じ名前の月フォルダがあればそこへ、なければ元の名前で作る。
   - 既存の同月フォルダが別名(例: 保管先の`2026年10月`)の場合も、そこを使う。
3. 元の月フォルダ内の写真・PDFをcopy_fileで、元と同じファイル名でコピーする。

## 同名ファイルの扱い
- 保管先の月フォルダに同名ファイルがすでにあれば、コピーしない(スキップ)。重複して保存しない。

## 実行手順(承認の回数を減らすため)
1. 検索は店舗をまとめて1回のターンで並列に行う(`parentId = 'X' or parentId = 'Y'`のように1クエリに束ねてもよい)。ページ送り(nextPageToken)が出たら最後まで取得する。
2. コピー・フォルダ作成も、同じターン内で並列に呼ぶ。1件ずつ確認を取らず、一覧を作ってから一括で実行する。
3. 終わったら、店舗ごとに「コピー件数/スキップ件数/見つからなかった物」を表で報告する。

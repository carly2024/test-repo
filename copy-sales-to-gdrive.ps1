# スマレジ売上PDFを Google ドライブ (G:) の「年月\売上」フォルダへコピーする
#
# 使い方:
#   1) 確認だけ（コピーしない）:  .\copy-sales-to-gdrive.ps1
#   2) 実際にコピー:              .\copy-sales-to-gdrive.ps1 -Execute
#
# ルール:
#   - ファイル名の先頭8桁(yyyymmdd)から年月を判定する
#   - 年月フォルダがなければコピーしない（報告のみ）
#   - 「売上」フォルダがなければコピーしない（Googleドライブの同期待ちの可能性があるため）
#   - 「売上」フォルダに同名ファイルがあればスキップ
param(
    [string]$Src  = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'スマレジ\スマレジゴルフ'),
    [string]$Dest = '',
    [switch]$Execute
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Src)) {
    throw "コピー元が見つかりません: $Src （-Src でパスを指定してください）"
}

# コピー先（Googleドライブ上の「バーディー宝来（ゴルフカフェ）」）を自動検索
if (-not $Dest) {
    Write-Host 'コピー先を検索しています...'
    $cands = foreach ($d in (Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Name -ne 'C' })) {
        Get-ChildItem -LiteralPath $d.Root -Directory -Recurse -Depth 3 -Filter 'バーディー宝来*' -ErrorAction SilentlyContinue
    }
    $hit = $cands | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName '202609') } | Select-Object -First 1
    if (-not $hit) {
        throw 'コピー先が見つかりません。-Dest "G:\...\バーディー宝来（ゴルフカフェ）" のように指定してください。'
    }
    $Dest = $hit.FullName
}
Write-Host "コピー元: $Src"
Write-Host "コピー先: $Dest"
Write-Host ("モード  : " + $(if ($Execute) { '実行(コピーする)' } else { '確認のみ(コピーしない)' }))
Write-Host ''

$salesName = '売上'
$log = New-Object System.Collections.Generic.List[object]

$files = Get-ChildItem -LiteralPath $Src -Filter *.pdf -File
foreach ($f in $files) {
    if ($f.Name -notmatch '^(\d{4})(\d{2})\d{2}') {
        $log.Add([pscustomobject]@{ Month = ''; File = $f.Name; Result = '対象外(日付なし)' })
        continue
    }
    $ym = $Matches[1] + $Matches[2]
    $monthDir = Join-Path $Dest $ym
    if (-not (Test-Path -LiteralPath $monthDir)) {
        $log.Add([pscustomobject]@{ Month = $ym; File = $f.Name; Result = '年月フォルダなし' })
        continue
    }
    $salesDir = Join-Path $monthDir $salesName
    if (-not (Test-Path -LiteralPath $salesDir)) {
        $log.Add([pscustomobject]@{ Month = $ym; File = $f.Name; Result = '売上フォルダなし(同期待ち?)' })
        continue
    }
    $target = Join-Path $salesDir $f.Name
    if (Test-Path -LiteralPath $target) {
        $log.Add([pscustomobject]@{ Month = $ym; File = $f.Name; Result = 'スキップ(既存)' })
        continue
    }
    if ($Execute) {
        Copy-Item -LiteralPath $f.FullName -Destination $target
        $log.Add([pscustomobject]@{ Month = $ym; File = $f.Name; Result = 'コピー済み' })
    } else {
        $log.Add([pscustomobject]@{ Month = $ym; File = $f.Name; Result = 'コピー予定' })
    }
}

Write-Host '--- 月ごとの結果 ---'
$log | Group-Object Month, Result | Sort-Object Name | ForEach-Object {
    Write-Host ("{0} : {1} 件" -f $_.Name, $_.Count)
}
Write-Host ''
Write-Host ("合計 {0} 件を処理" -f $log.Count)

$logPath = Join-Path ([Environment]::GetFolderPath('Desktop')) ("copy-sales-log_{0}.csv" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
$log | Export-Csv -LiteralPath $logPath -NoTypeInformation -Encoding UTF8
Write-Host "詳細ログ: $logPath"

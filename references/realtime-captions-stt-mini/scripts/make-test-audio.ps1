param(
    [string]$Path = (Join-Path $PSScriptRoot '..\.local\synthetic-test.wav'),
    [string]$SourceScript
)
$ErrorActionPreference = 'Stop'
$sourceText = $null
if ($PSBoundParameters.ContainsKey('SourceScript')) {
    if ([string]::IsNullOrWhiteSpace($SourceScript)) { throw 'SourceScript cannot be empty.' }
    $sourceText = [IO.File]::ReadAllText([IO.Path]::GetFullPath($SourceScript), [Text.Encoding]::UTF8).Trim()
    if ([string]::IsNullOrWhiteSpace($sourceText)) { throw 'The source manuscript is empty.' }
}
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
    16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
    [System.Speech.AudioFormat.AudioChannel]::Mono
)
try {
    $fullPath = [IO.Path]::GetFullPath($Path)
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($fullPath)) | Out-Null
    $synth.SetOutputToWaveFile($fullPath, $format)
    $prompt = New-Object System.Speech.Synthesis.PromptBuilder
    $prompt.AppendBreak([TimeSpan]::FromMilliseconds(1500))
    $prompt.StartVoice('Microsoft Zira Desktop')
    if ($null -ne $sourceText) {
        $prompt.AppendText($sourceText)
        $prompt.AppendBreak([TimeSpan]::FromMilliseconds(1500))
        $prompt.EndVoice()
    } else {
        $prompt.AppendText('This fictional clinical study enrolled three hundred and sixty participants across twelve research centers.')
        $prompt.AppendBreak([TimeSpan]::FromMilliseconds(1000))
        $prompt.AppendText('An adverse event is not necessarily caused by the investigational product. We must evaluate the relationship rather than assume it.')
        $prompt.AppendBreak([TimeSpan]::FromMilliseconds(1000))
        $prompt.AppendText('Statistical significance does not automatically mean that patients receive a meaningful clinical benefit.')
        $prompt.AppendBreak([TimeSpan]::FromMilliseconds(1600))
        $prompt.EndVoice()
        $prompt.StartVoice('Microsoft Huihui Desktop')
        $chinese = -join ([char[]]@(0x8FD9,0x53EA,0x662F,0x4E00,0x6B21,0x6F14,0x793A,0x3002,0x6211,0x4EEC,0x9700,0x8981,0x8BA4,0x771F,0x6838,0x5BF9,0x6570,0x636E,0xFF0C,0x4E0D,0x80FD,0x628A,0x521D,0x6B65,0x7ED3,0x679C,0x5F53,0x4F5C,0x6700,0x7EC8,0x7ED3,0x8BBA,0x3002))
        $prompt.AppendText($chinese)
        $prompt.AppendBreak([TimeSpan]::FromMilliseconds(1500))
        $prompt.EndVoice()
    }
    $synth.Speak($prompt)
    Write-Output ('Synthetic test audio: ' + $fullPath)
} finally { $synth.Dispose() }

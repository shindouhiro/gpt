Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$script:customText = [string]$env:GPT_CUSTOM_PROMPT
$script:customAlpha = $env:GPT_CUSTOM_ALPHA -eq 'true'

$form = New-Object System.Windows.Forms.Form
$form.Text = '图片处理提示词'
$form.ClientSize = New-Object System.Drawing.Size(620, 470)
$form.MinimumSize = $form.Size
$form.AutoScaleMode = 'Dpi'
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'Sizable'
$form.MaximizeBox = $true
$form.MinimizeBox = $false
$form.TopMost = $true
$form.Tag = $null

$useDefault = New-Object System.Windows.Forms.CheckBox
$useDefault.Name = 'use-default-prompt'
$useDefault.Text = '使用默认提示词（保留主体，移除背景，透明 PNG）'
$useDefault.Location = New-Object System.Drawing.Point(20, 20)
$useDefault.Size = New-Object System.Drawing.Size(580, 30)
$useDefault.Anchor = 'Top, Left, Right'
$useDefault.Checked = $env:GPT_USE_DEFAULT_PROMPT -ne 'false'
$form.Controls.Add($useDefault)

$editor = New-Object System.Windows.Forms.TextBox
$editor.Name = 'custom-prompt-text'
$editor.Multiline = $true
$editor.AcceptsReturn = $true
$editor.ScrollBars = 'Vertical'
$editor.Location = New-Object System.Drawing.Point(20, 65)
$editor.Size = New-Object System.Drawing.Size(580, 240)
$editor.Anchor = 'Top, Bottom, Left, Right'
$editor.Text = if ($useDefault.Checked) { $env:GPT_DEFAULT_PROMPT } else { $script:customText }
$editor.ReadOnly = $useDefault.Checked
$form.Controls.Add($editor)

$alpha = New-Object System.Windows.Forms.CheckBox
$alpha.Name = 'require-transparent-output'
$alpha.Text = '校验真实透明通道（白底图片请勿勾选）'
$alpha.Location = New-Object System.Drawing.Point(20, 345)
$alpha.Size = New-Object System.Drawing.Size(580, 30)
$alpha.Anchor = 'Bottom, Left, Right'
$alpha.Checked = if ($useDefault.Checked) { $true } else { $script:customAlpha }
$alpha.Enabled = -not $useDefault.Checked
$form.Controls.Add($alpha)

$hint = New-Object System.Windows.Forms.Label
$hint.Name = 'prompt-input-status'
$hint.Location = New-Object System.Drawing.Point(20, 312)
$hint.Size = New-Object System.Drawing.Size(580, 28)
$hint.Anchor = 'Bottom, Left, Right'
$form.Controls.Add($hint)

$useDefault.Add_CheckedChanged({
  if ($useDefault.Checked) {
    $script:customText = $editor.Text
    $script:customAlpha = $alpha.Checked
    $editor.Text = $env:GPT_DEFAULT_PROMPT
    $alpha.Checked = $true
  } else {
    $editor.Text = $script:customText
    $alpha.Checked = $script:customAlpha
  }
  $editor.ReadOnly = $useDefault.Checked
  $alpha.Enabled = -not $useDefault.Checked
  Update-PromptStatus
  if (-not $useDefault.Checked) { [void]$editor.Focus() }
})

$start = New-Object System.Windows.Forms.Button
$start.Name = 'start-image-batch'
$start.Text = '开始处理'
$start.Location = New-Object System.Drawing.Point(345, 415)
$start.Size = New-Object System.Drawing.Size(120, 35)
$start.Anchor = 'Bottom, Right'
$start.Add_Click({
  if (-not $useDefault.Checked -and [string]::IsNullOrWhiteSpace($editor.Text)) {
    [void][System.Windows.Forms.MessageBox]::Show($form, '请输入提示词，或勾选使用默认提示词。', '提示词不能为空')
    [void]$editor.Focus()
    return
  }
  $form.Tag = @{
    useDefault = $useDefault.Checked
    text = $editor.Text
    requireAlpha = $alpha.Checked
    customText = $script:customText
    customRequireAlpha = $script:customAlpha
  }
  $form.Close()
})
$form.Controls.Add($start)

$cancel = New-Object System.Windows.Forms.Button
$cancel.Name = 'cancel-prompt-selection'
$cancel.Text = '取消'
$cancel.Location = New-Object System.Drawing.Point(480, 415)
$cancel.Size = New-Object System.Drawing.Size(120, 35)
$cancel.Anchor = 'Bottom, Right'
$cancel.Add_Click({ $form.Close() })
$form.Controls.Add($cancel)
$form.CancelButton = $cancel

$remember = New-Object System.Windows.Forms.Label
$remember.Name = 'prompt-save-hint'
$remember.Text = '点击开始后记住本次设置；取消不保存、不上传。'
$remember.Location = New-Object System.Drawing.Point(20, 380)
$remember.Size = New-Object System.Drawing.Size(580, 28)
$remember.Anchor = 'Bottom, Left, Right'
$form.Controls.Add($remember)

function Update-PromptStatus {
  $valid = $useDefault.Checked -or -not [string]::IsNullOrWhiteSpace($editor.Text)
  $start.Enabled = $valid
  $hint.Text = if ($useDefault.Checked) { '默认提示词预览（取消勾选后可输入自定义内容）' }
    elseif ($valid) { '已输入 ' + $editor.Text.Length + ' 个字符，将应用于本批全部图片。' }
    else { '请输入提示词，或勾选使用默认提示词。' }
}
$editor.Add_TextChanged({ Update-PromptStatus })
Update-PromptStatus

try {
  [void]$form.ShowDialog()
  if ($null -eq $form.Tag) { 'null' }
  else { ConvertTo-Json -InputObject $form.Tag -Compress }
} finally { $form.Dispose() }

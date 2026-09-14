Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = '图片批处理'
$form.ClientSize = New-Object System.Drawing.Size(430, 150)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true
$form.Tag = 'cancel'

$label = New-Object System.Windows.Forms.Label
$label.Text = '选择图片或文件夹，支持 PNG、JPEG、WebP。'
$label.AutoSize = $true
$label.Location = New-Object System.Drawing.Point(20, 25)
$form.Controls.Add($label)

$files = New-Object System.Windows.Forms.Button
$files.Name = 'select-image-files'
$files.Text = '选择图片'
$files.Location = New-Object System.Drawing.Point(20, 80)
$files.Size = New-Object System.Drawing.Size(120, 35)
$files.Add_Click({ $form.Tag = 'files'; $form.Close() })
$form.Controls.Add($files)

$folder = New-Object System.Windows.Forms.Button
$folder.Name = 'select-image-folder'
$folder.Text = '选择文件夹'
$folder.Location = New-Object System.Drawing.Point(155, 80)
$folder.Size = New-Object System.Drawing.Size(120, 35)
$folder.Add_Click({ $form.Tag = 'folder'; $form.Close() })
$form.Controls.Add($folder)

$cancel = New-Object System.Windows.Forms.Button
$cancel.Name = 'cancel-image-selection'
$cancel.Text = '取消'
$cancel.Location = New-Object System.Drawing.Point(290, 80)
$cancel.Size = New-Object System.Drawing.Size(120, 35)
$cancel.Add_Click({ $form.Close() })
$form.Controls.Add($cancel)
$form.CancelButton = $cancel
$form.AcceptButton = $files

$selected = @()
try {
  [void]$form.ShowDialog()
  if ($form.Tag -eq 'files') {
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    try {
      $dialog.Title = '选择图片，按住 Ctrl 或 Shift 可多选'
      $dialog.Filter = '图片 (*.png;*.jpg;*.jpeg;*.webp)|*.png;*.jpg;*.jpeg;*.webp'
      $dialog.Multiselect = $true
      $dialog.CheckFileExists = $true
      if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $selected = @($dialog.FileNames)
      }
    } finally { $dialog.Dispose() }
  } elseif ($form.Tag -eq 'folder') {
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    try {
      $dialog.Description = '选择图片文件夹（只处理第一层图片）'
      $dialog.ShowNewFolderButton = $false
      if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $selected = @($dialog.SelectedPath)
      }
    } finally { $dialog.Dispose() }
  }
} finally { $form.Dispose() }
ConvertTo-Json -InputObject @($selected) -Compress

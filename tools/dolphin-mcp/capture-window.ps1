param([Parameter(Mandatory=$true)][int]$DolphinProcessId,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
$condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$DolphinProcessId)
$windows=[System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,$condition)
$target=@($windows | Where-Object {$_.Current.Name -match 'Skylanders.*SSPP52'})
if($target.Count -ne 1){throw 'Unique SSA render window required'}
$rect=$target[0].Current.BoundingRectangle
$bitmap=New-Object System.Drawing.Bitmap ([int]$rect.Width),([int]$rect.Height)
$graphics=[Drawing.Graphics]::FromImage($bitmap)
try{$graphics.CopyFromScreen([int]$rect.X,[int]$rect.Y,0,0,$bitmap.Size);$bitmap.Save($Output,[Drawing.Imaging.ImageFormat]::Png)}finally{$graphics.Dispose();$bitmap.Dispose()}
Write-Output $Output

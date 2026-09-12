param([Parameter(Mandatory=$true)][int]$DolphinProcessId)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $DolphinProcessId)
$windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
foreach ($window in $windows) {
  Write-Output ('WINDOW: ' + $window.Current.Name)
  $elements = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($element in $elements) {
    [pscustomobject]@{Name=$element.Current.Name; Type=$element.Current.ControlType.ProgrammaticName; Enabled=$element.Current.IsEnabled; Id=$element.Current.AutomationId; Handle=$element.Current.NativeWindowHandle; Patterns=@($element.GetSupportedPatterns() | ForEach-Object {$_.ProgrammaticName}); Value=$(if($element.GetSupportedPatterns().ProgrammaticName -contains 'ValuePatternIdentifiers.Pattern'){$element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value})} | ConvertTo-Json -Compress
  }
}

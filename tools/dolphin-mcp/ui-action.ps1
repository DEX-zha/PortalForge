param(
 [Parameter(Mandatory=$true)][int]$DolphinProcessId,
 [Parameter(Mandatory=$true)][string]$Name,
 [ValidateSet('invoke','expand','set')][string]$Action='invoke',
 [string]$Value='', [int]$Index=0
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$process=Get-Process -Id $DolphinProcessId
if ($process.ProcessName -ne 'Dolphin') { throw 'Expected Dolphin' }
$condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$DolphinProcessId)
$windows=[System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,$condition)
$matches=@()
foreach($window in $windows) {
 $items=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
 foreach($item in $items) {if($item.Current.Name -eq $Name -and $item.Current.IsEnabled) {$matches+=,$item}}
}
if($Index -lt 0 -or $Index -ge $matches.Count) {throw "Control not found: $Name (index $Index)"}
$target=$matches[$Index]
switch($Action) {
 'invoke' { $pattern=$target.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern);$pattern.Invoke() }
 'expand' { $pattern=$target.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern);$pattern.Expand() }
 'set' { $pattern=$target.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern);$pattern.SetValue($Value) }
}
@{control=$Name;action=$Action;pid=$DolphinProcessId}|ConvertTo-Json

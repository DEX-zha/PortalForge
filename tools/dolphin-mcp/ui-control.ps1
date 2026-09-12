param(
 [Parameter(Mandatory=$true)][int]$DolphinProcessId,
 [Parameter(Mandatory=$true)][ValidateSet('status','pause','resume','load_figure','remove_figure','save_state','load_state','connect_wiimote')][string]$Operation,
 [string]$Filename,[ValidateRange(1,16)][int]$Slot=1
)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
if((Get-Process -Id $DolphinProcessId).ProcessName -ne 'Dolphin'){throw 'Expected Dolphin'}
$scope=[System.Windows.Automation.TreeScope]::Descendants
$all=[System.Windows.Automation.Condition]::TrueCondition
function Elements {
 $condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$DolphinProcessId)
 $windows=[System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,$condition)
 foreach($window in $windows){foreach($item in $window.FindAll($scope,$all)){Write-Output $item}}
}
function Find-Control($pattern,$type='Button') {
 $found=@(Elements | Where-Object {$_.Current.IsEnabled -and $_.Current.Name -match $pattern -and $_.Current.ControlType.ProgrammaticName -eq ('ControlType.'+$type)})
 if($found.Count -gt 1){throw "Ambiguous UI control: $pattern"}
 if($found.Count -eq 1){return $found[0]}
 return $null
}
function Invoke-Control($pattern,$type='Button',$expand=$false) {
 $item=Find-Control $pattern $type
 if($null -eq $item){throw "Missing UI control: $pattern"}
 if($expand){$item.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand()}
 else{$item.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()}
 Start-Sleep -Milliseconds 150
}
function Playback-State {
 if($null -ne (Find-Control '^Pause$')){return 'running'}
 if($null -ne (Find-Control '^(Play|D.marrer|Resume)$')){return 'paused_or_stopped'}
 return 'unknown'
}
function Slot-Row {
 $label=@(Elements | Where-Object {$_.Current.Name -eq "Skylander $Slot" -and $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Text})
 if($label.Count -ne 1){throw 'Portal slot not found or ambiguous'}
 return [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($label[0])
}
function Slot-Value {
 $row=Slot-Row
 $edit=$row.FindFirst($scope,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit)))
 if($null -eq $edit){throw 'Portal slot value unavailable'}
 return $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
}
switch($Operation){
 'connect_wiimote' {
  if($Slot -gt 4){throw 'Wiimote must be 1..4'}
  Invoke-Control '^(Tools|Outils)$' 'MenuItem' $true
  Invoke-Control '^(Connect Wii Remotes|Connecter les Wiimotes)$' 'MenuItem' $true
  $item=Find-Control "^(Connect Wii Remote|Connecter la Wiimote) $Slot$" 'MenuItem'
  if($null -eq $item){throw 'Wiimote connection control missing'}
  $toggle=$item.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
  $before=$toggle.Current.ToggleState.ToString()
  if($before -eq 'Off'){$toggle.Toggle();Start-Sleep -Milliseconds 300}
  $after=$toggle.Current.ToggleState.ToString()
  if($after -ne 'On'){throw 'Wiimote connection not observed'}
  @{pid=$DolphinProcessId;wiimote=$Slot;before=$before;after=$after}|ConvertTo-Json -Compress
 }
 {$_ -in 'save_state','load_state'} {
  if($Slot -gt 10){throw 'Native state slots must be 1..10'}
  Invoke-Control '^(Emulation|.mulation)$' 'MenuItem' $true
  if($Operation -eq 'save_state'){
   Invoke-Control '^(Save State|Sauvegarder l.tat|Sauvegarder l..tat)$' 'MenuItem' $true
   Invoke-Control '^(Save State to Slot|Sauvegarder l..tat dans le slot)$' 'MenuItem' $true
   Invoke-Control "^(Save to Slot|Sauvegarder dans le slot) $Slot -" 'MenuItem'
  }else{
   Invoke-Control '^(Load State|Charger l..tat)$' 'MenuItem' $true
   Invoke-Control '^(Load State from Slot|Charger un .tat depuis un slot)$' 'MenuItem' $true
   Invoke-Control "^(Load from Slot|Chargement depuis le Slot) $Slot -" 'MenuItem'
  }
  @{pid=$DolphinProcessId;operation=$Operation;slot=$Slot;scheduled=$true}|ConvertTo-Json -Compress
 }
 'status' {@{pid=$DolphinProcessId;playback=(Playback-State)}|ConvertTo-Json -Compress}
 {$_ -in 'pause','resume'} {
  $before=Playback-State
  if($Operation -eq 'pause' -and $before -eq 'running'){Invoke-Control '^Pause$'}
  elseif($Operation -eq 'resume' -and $before -eq 'paused_or_stopped'){Invoke-Control '^(Play|D.marrer|Resume)$'}
  elseif($before -eq 'unknown'){throw 'Cannot determine playback state'}
  $after=Playback-State
  $expected=if($Operation -eq 'pause'){'paused_or_stopped'}else{'running'}
  if($after -ne $expected){throw "Playback transition not observed: $after"}
  @{pid=$DolphinProcessId;before=$before;after=$after;verified_by='Dolphin toolbar'}|ConvertTo-Json -Compress
 }
 {$_ -in 'load_figure','remove_figure'} {
  if($null -eq (Find-Control '^(Load File|Charger le fichier)$')){
   Invoke-Control '^(Tools|Outils)$' 'MenuItem' $true
   Invoke-Control '^(Emulated USB Devices|Appareils USB .mul.s)$' 'MenuItem' $true
   Invoke-Control '^(Skylanders Portal|Skylander Portal|Portail Skylanders)$' 'MenuItem'
  }
  $row=Slot-Row
  $radio=$row.FindFirst($scope,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::RadioButton)))
  if($null -eq $radio){throw 'Portal slot selector unavailable'}
  $radio.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
  $before=Slot-Value
  if($Operation -eq 'load_figure'){
   if(-not (Test-Path -LiteralPath $Filename -PathType Leaf)){throw 'Figure file missing'}
   if($before -notmatch '^(None|Aucune|Empty|)$'){
    Invoke-Control '^(Clear Slot|Effacer le slot)$'
    if((Slot-Value) -notmatch '^(None|Aucune|Empty|)$'){throw 'Could not clear previous figure'}
   }
   Invoke-Control '^(Load File|Charger le fichier)$'
   Start-Sleep -Milliseconds 400
   & "$PSScriptRoot/native-dialog.ps1" -DolphinProcessId $DolphinProcessId -Filename $Filename | Out-Null
   $after=$before
   for($attempt=0;$attempt -lt 30;$attempt++){
    Start-Sleep -Milliseconds 100
    $after=Slot-Value
    if($after -notmatch '^(None|Aucune|Empty|)$'){break}
   }
   if($after -match '^(None|Aucune|Empty|)$'){throw 'No loaded figure observed in Portal slot'}
  }else{
   Invoke-Control '^(Clear Slot|Effacer le slot)$'
   $after=Slot-Value
   if($after -notmatch '^(None|Aucune|Empty|)$'){throw 'Slot removal not observed'}
  }
  @{pid=$DolphinProcessId;slot=$Slot;before=$before;after=$after;file=$Filename;verified_by='Portal slot UI; game recognition requires screenshot'}|ConvertTo-Json -Compress
 }
}

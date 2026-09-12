param([Parameter(Mandatory=$true)][int]$DolphinProcessId,[string]$Filename)
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class DialogNative {
 public class Control { public long Handle; public string Name; public string Class; public int Id; }
 public static List<Control> Inspect(int target) {
  var result=new List<Control>();
  EnumWindows((h,a)=>{uint pid;GetWindowThreadProcessId(h,out pid);if(pid==target) {
   EnumChildWindows(h,(c,b)=>{var text=new StringBuilder(1024);var cls=new StringBuilder(256);GetWindowText(c,text,1024);GetClassName(c,cls,256);result.Add(new Control{Handle=c.ToInt64(),Name=text.ToString(),Class=cls.ToString(),Id=GetDlgCtrlID(c)});return true;},IntPtr.Zero);
  }return true;},IntPtr.Zero);return result;
 }
 public delegate bool Callback(IntPtr hwnd,IntPtr arg);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback cb,IntPtr arg);
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hwnd,Callback cb,IntPtr arg);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int max);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd,StringBuilder text,int max);
 [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr hwnd);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr hwnd,uint msg,IntPtr w,string l);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd,uint msg,IntPtr w,IntPtr l);
}
'@
if((Get-Process -Id $DolphinProcessId).ProcessName -ne 'Dolphin'){throw 'Expected Dolphin'}
$script:controls=@([DialogNative]::Inspect($DolphinProcessId))
if($Filename){
 $edit=@($script:controls | Where-Object {$_.Class -eq 'Edit' -and $_.Id -eq 1148})
 $open=@($script:controls | Where-Object {$_.Class -eq 'Button' -and $_.Id -eq 1})
 if($edit.Count -ne 1 -or $open.Count -ne 1){throw 'Ambiguous or missing native file dialog'}
 [void][DialogNative]::SendMessage($edit[0].Handle,0x000C,[IntPtr]::Zero,$Filename)
 [void][DialogNative]::PostMessage($open[0].Handle,0x00F5,[IntPtr]::Zero,[IntPtr]::Zero)
 @{file=$Filename;submitted=$true}|ConvertTo-Json
}else{$script:controls | ConvertTo-Json -Compress}

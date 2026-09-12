param([Parameter(Mandatory=$true)][int]$DolphinProcessId)
$ErrorActionPreference = 'Stop'
$process = Get-Process -Id $DolphinProcessId -ErrorAction Stop
if ($process.ProcessName -ne 'Dolphin') { throw 'Expected a Dolphin process' }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DolphinWindows {
  public delegate bool Callback(IntPtr window, IntPtr param);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr param);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
  public static void Close(int target) {
    EnumWindows((window, param) => {
      uint owner; GetWindowThreadProcessId(window, out owner);
      if(owner == target) PostMessage(window, 0x0010, IntPtr.Zero, IntPtr.Zero);
      return true;
    }, IntPtr.Zero);
  }
}
'@
[DolphinWindows]::Close($DolphinProcessId)

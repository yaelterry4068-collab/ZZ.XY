$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class DoubleZHook {
  public delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

  public const int WH_KEYBOARD_LL = 13;
  public const int WM_KEYDOWN = 0x0100;
  public const int WM_KEYUP = 0x0101;
  public const int WM_SYSKEYDOWN = 0x0104;
  public const int WM_SYSKEYUP = 0x0105;
  public const int VK_Z = 0x5A;

  public static LowLevelKeyboardProc Proc = HookCallback;
  public static IntPtr HookId = IntPtr.Zero;
  public static long LastZTicks = 0;
  public static bool ZDown = false;
  public static readonly long DoublePressTicks = TimeSpan.FromMilliseconds(420).Ticks;

  [StructLayout(LayoutKind.Sequential)]
  public struct KBDLLHOOKSTRUCT {
    public int vkCode;
    public int scanCode;
    public int flags;
    public int time;
    public IntPtr dwExtraInfo;
  }

  public static IntPtr SetHook() {
    using (Process currentProcess = Process.GetCurrentProcess())
    using (ProcessModule currentModule = currentProcess.MainModule) {
      return SetWindowsHookEx(WH_KEYBOARD_LL, Proc, GetModuleHandle(currentModule.ModuleName), 0);
    }
  }

  public static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0) {
      int message = wParam.ToInt32();
      KBDLLHOOKSTRUCT info = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);

      if (info.vkCode == VK_Z && (message == WM_KEYDOWN || message == WM_SYSKEYDOWN)) {
        if (!ZDown) {
          long now = DateTime.UtcNow.Ticks;
          if (LastZTicks > 0 && now - LastZTicks <= DoublePressTicks) {
            Console.WriteLine("DOUBLE_Z");
            Console.Out.Flush();
            LastZTicks = 0;
          } else {
            LastZTicks = now;
          }

          ZDown = true;
        }
      }

      if (info.vkCode == VK_Z && (message == WM_KEYUP || message == WM_SYSKEYUP)) {
        ZDown = false;
      }
    }

    return CallNextHookEx(HookId, nCode, wParam, lParam);
  }

  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  public static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool UnhookWindowsHookEx(IntPtr hhk);

  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  public static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

  [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  public static extern IntPtr GetModuleHandle(string lpModuleName);
}
"@

Add-Type -AssemblyName System.Windows.Forms

[DoubleZHook]::HookId = [DoubleZHook]::SetHook()
if ([DoubleZHook]::HookId -eq [IntPtr]::Zero) {
  throw "Unable to install keyboard hook."
}

try {
  [System.Windows.Forms.Application]::Run()
} finally {
  [DoubleZHook]::UnhookWindowsHookEx([DoubleZHook]::HookId) | Out-Null
}

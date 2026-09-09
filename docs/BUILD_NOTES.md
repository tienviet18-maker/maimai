# Build Environment Notes

## Validated builds

- `assembleDebug` — BUILD SUCCESSFUL
- `bundleRelease` — BUILD SUCCESSFUL

## Recommended local tool paths (this machine)

```powershell
$env:JAVA_HOME = "E:\maimai-jdk21\jdk-21.0.12.1+1"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:GRADLE_USER_HOME = "E:\maimai-gradle"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
cd C:\Users\tienv\OneDrive\Desktop\MAIMAI_ANDROID\android
.\gradlew.bat assembleDebug
.\gradlew.bat bundleRelease
```

C: drive was nearly full; JDK/Gradle caches were placed on `E:`.

## AdMob status

PRODUCTION IDs configured. Play upload still needs signing keystore + device smoke for banner layout.


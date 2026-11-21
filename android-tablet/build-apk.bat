@echo off
setlocal
set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%.."

if not defined ANDROID_HOME if defined ANDROID_SDK_ROOT set "ANDROID_HOME=%ANDROID_SDK_ROOT%"
if not defined ANDROID_HOME if exist "%LOCALAPPDATA%\Android\Sdk\platforms" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"

if not defined JAVA_HOME (
  if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
  if not defined JAVA_HOME if exist "%LOCALAPPDATA%\Programs\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=%LOCALAPPDATA%\Programs\Android Studio\jbr"
)
if defined JAVA_HOME set "PATH=%JAVA_HOME%\bin;%PATH%"

call npm.cmd run build
if errorlevel 1 exit /b %ERRORLEVEL%

cd /d "%PROJECT_DIR%"
call "%PROJECT_DIR%gradlew.bat" --no-daemon assembleDebug
if errorlevel 1 exit /b %ERRORLEVEL%

echo Installable APK created: %PROJECT_DIR%app\build\outputs\apk\debug\app-debug.apk

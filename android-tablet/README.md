# IQRA Gesture Lab for Android tablets

This is a separate Android app project. It packages the existing web experience and its local MediaPipe models/WASM files in the APK, so the installed app can run without this computer, a web server, or an internet connection.

## Build the APK on Windows

1. Install Android Studio with Android SDK Platform 35 and a Java 17 runtime.
2. From this folder, run `build-apk.bat`. The script builds the existing web app and then assembles the Android app.
3. Send `app\build\outputs\apk\debug\app-debug.apk` to the tablet and install it. Android may ask you to allow installation from the app used to open the APK.
4. Open **IQRA Gesture Lab** and allow camera access when prompted.

The APK includes the gesture game, Aura Mirror, Filter Creator, both tracking models, and the MediaPipe WASM runtime. It does not request internet access; external web requests are blocked. Captured JPEG/PNG downloads are saved to **Pictures / IQRA Gesture Lab**.

The Android project requires Android Studio/SDK and Java 17 to build. Each tablet needs Android 10 (API 29) or newer. The first build downloads Gradle and Android build dependencies; running the installed APK does not use a network connection.

The generated APK is debug-signed for direct testing and sideloading. For a Play Store release or long-term updates, create a private release signing key and build a signed release APK.

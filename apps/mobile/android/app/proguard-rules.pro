# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# React Native basic rules
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.modules.core.DeviceEventManagerModule$RCTDeviceEventEmitter { *; }

-keep class com.Colota.** { *; }

# Keep Google Play Services Location
-keep class com.google.android.gms.location.** { *; }

# Standard optimization settings
-dontwarn com.facebook.react.**
-keepattributes Signature
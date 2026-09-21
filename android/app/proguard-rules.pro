# Gson: модели сериализуются по полям
-keep class com.anibeat.app.model.** { *; }
-keepattributes Signature
-keepattributes *Annotation*

# Media3 / ExoPlayer
-dontwarn androidx.media3.**

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**

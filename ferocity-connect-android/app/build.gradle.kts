import java.util.Properties

plugins {
    id("com.android.application")
}

val localSigning = Properties().apply {
    val source = rootProject.file("../.private/ferocity-connect-signing.properties")
    if (source.isFile) source.inputStream().use { load(it) }
}
fun signingValue(name: String): String? = providers.gradleProperty(name).orNull?.takeIf(String::isNotBlank)
    ?: localSigning.getProperty(name)?.takeIf(String::isNotBlank)
val releaseStoreFile = signingValue("ferocityReleaseStoreFile")
val releaseStorePassword = signingValue("ferocityReleaseStorePassword")
val releaseKeyAlias = signingValue("ferocityReleaseKeyAlias")
val releaseKeyPassword = signingValue("ferocityReleaseKeyPassword")

android {
    namespace = "live.ferocity.connect"
    compileSdk = 36

    defaultConfig {
        applicationId = "live.ferocity.connect"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "1.0.1"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        val apiBaseUrl = providers.gradleProperty("ferocityApiBaseUrl").orElse("https://ferocity.live")
        buildConfigField("String", "DEFAULT_API_BASE_URL", "\"${apiBaseUrl.get()}\"")
    }
    buildFeatures { buildConfig = true }
    signingConfigs {
        if (releaseStoreFile != null && releaseStorePassword != null && releaseKeyAlias != null && releaseKeyPassword != null) {
            create("ferocityRelease") {
                storeFile = file(releaseStoreFile)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = true
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfigs.findByName("ferocityRelease")?.let { signingConfig = it }
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("com.google.android.material:material:1.13.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
}

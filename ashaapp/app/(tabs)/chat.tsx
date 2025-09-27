import React, { useEffect, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Platform, PermissionsAndroid } from "react-native";
import { WebView } from "react-native-webview";
import { Audio } from "expo-av";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ChatScreen() {
  const [granted, setGranted] = useState(false);
  const [checkingPermission, setCheckingPermission] = useState(true);

  useEffect(() => {
    const requestPermission = async () => {
      try {
        if (Platform.OS === "android") {
          const grantedAndroid = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
              title: "Microphone Permission",
              message: "This app needs access to your microphone for the chatbot",
              buttonPositive: "OK",
            }
          );
          setGranted(grantedAndroid === PermissionsAndroid.RESULTS.GRANTED);
        } else {
          const { status } = await Audio.requestPermissionsAsync();
          setGranted(status === "granted");
        }
      } catch (error) {
        console.error("Error requesting microphone permission:", error);
      } finally {
        setCheckingPermission(false);
      }
    };

    requestPermission();
  }, []);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>CoRover Chatbot</title>
      </head>
      <body>
        <div id="corover-root"></div>
        <script>
          function loadBot() {
            var s = document.createElement("script");
            s.src = "https://builder.corover.ai/params/widget/corovercb.lib.min.js?appId=2abc7a69-1d6e-4a6b-86e5-cea03ef9af76";
            s.type = "text/javascript";
            s.onload = () => console.log("CoRover script loaded");
            document.body.appendChild(s);
          }
          window.onload = loadBot;
        </script>
      </body>
    </html>
  `;

  if (checkingPermission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#0a7ea4" />
        </View>
      </SafeAreaView>
    );
  }

  if (!granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loader}>
          <ActivityIndicator size="small" color="#0a7ea4" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <WebView
        originWhitelist={["*"]}
        source={{ html: htmlContent }}
        javaScriptEnabled
        domStorageEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        startInLoadingState
        style={{ flex: 1 }}
        // iOS microphone permission handled via Audio.requestPermissionsAsync
        // Android handled via PermissionsAndroid
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
});

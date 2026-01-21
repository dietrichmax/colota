import { Platform } from "react-native";
import RNFS from "react-native-fs";

let cachedOlCss: string | null = null;
let cachedOlJs: string | null = null;
let loadingPromise: Promise<{css: string, js: string}> | null = null;

export async function loadOpenLayersAssets() {
  // Return cached if available
  if (cachedOlCss && cachedOlJs) {
    return { css: cachedOlCss, js: cachedOlJs };
  }

  // Return existing promise if already loading
  if (loadingPromise) {
    return loadingPromise;
  }

  // Start loading
  loadingPromise = (async () => {
    try {
      if (Platform.OS === "android") {
        cachedOlCss = await RNFS.readFileAssets("openlayers/ol.css", "utf8");
        cachedOlJs = await RNFS.readFileAssets("openlayers/ol.js", "utf8");
      } else {
        const cssPath = `${RNFS.MainBundlePath}/openlayers/ol.css`;
        const jsPath = `${RNFS.MainBundlePath}/openlayers/ol.js`;
        cachedOlCss = await RNFS.readFile(cssPath, "utf8");
        cachedOlJs = await RNFS.readFile(jsPath, "utf8");
      }
      return { css: cachedOlCss, js: cachedOlJs };
    } catch (err) {
      console.error("Failed to load OpenLayers assets:", err);
      loadingPromise = null; // Reset to allow retry
      throw err;
    }
  })();

  return loadingPromise;
}
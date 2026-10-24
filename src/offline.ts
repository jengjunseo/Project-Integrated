export async function registerWorker() {
  if ("serviceWorker" in navigator)
    return navigator.serviceWorker.register(
      new URL("./sw.js", document.baseURI),
      { scope: "./" },
    );
  return null;
}

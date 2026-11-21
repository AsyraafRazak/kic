package com.kelabiqra.gesturelab;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final int CAMERA_PERMISSION_REQUEST = 17;
    private static final String APP_HOST = WebViewAssetLoader.DEFAULT_DOMAIN;

    private WebView webView;
    private PermissionRequest pendingCameraRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportMultipleWindows(false);
        webView.addJavascriptInterface(new ImageDownloadBridge(), "AndroidDownloads");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                android.webkit.WebResourceResponse response = assetLoader.shouldInterceptRequest(request.getUrl());
                if (response != null) return response;
                return new android.webkit.WebResourceResponse(
                        "text/plain",
                        "UTF-8",
                        404,
                        "Not Found",
                        Collections.emptyMap(),
                        new ByteArrayInputStream(new byte[0]));
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return !"https".equals(uri.getScheme()) || !APP_HOST.equals(uri.getHost());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                installImageDownloadHandler(view);
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                Uri origin = request.getOrigin();
                if (!"https".equals(origin.getScheme()) || !APP_HOST.equals(origin.getHost())) {
                    request.deny();
                    return;
                }

                ArrayList<String> allowedResources = new ArrayList<>();
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                        allowedResources.add(resource);
                    }
                }
                if (allowedResources.isEmpty()) {
                    request.deny();
                    return;
                }

                runOnUiThread(() -> grantCameraPermission(request, allowedResources.toArray(new String[0])));
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingCameraRequest == request) pendingCameraRequest = null;
            }
        });
        setContentView(webView);
        webView.loadUrl("https://" + APP_HOST + "/index.html");
    }

    private void grantCameraPermission(PermissionRequest request, String[] resources) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            request.grant(resources);
            return;
        }

        pendingCameraRequest = request;
        requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
    }

    private void installImageDownloadHandler(WebView view) {
        String script = "(function(){"
                + "if(window.__iqraDownloadHandlerInstalled)return;"
                + "window.__iqraDownloadHandlerInstalled=true;"
                + "document.addEventListener('click',function(event){"
                + "var link=event.target.closest('a[download]');"
                + "if(!link||!link.href.startsWith('blob:'))return;"
                + "event.preventDefault();"
                + "fetch(link.href).then(function(response){return response.blob();})"
                + ".then(function(blob){var reader=new FileReader();"
                + "reader.onloadend=function(){window.AndroidDownloads.saveImage("
                + "link.download,blob.type,String(reader.result));};"
                + "reader.onerror=function(){window.AndroidDownloads.reportSaveError();};"
                + "reader.readAsDataURL(blob);})"
                + ".catch(function(){window.AndroidDownloads.reportSaveError();});"
                + "},true);})();";
        view.evaluateJavascript(script, null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != CAMERA_PERMISSION_REQUEST || pendingCameraRequest == null) return;

        PermissionRequest request = pendingCameraRequest;
        pendingCameraRequest = null;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        } else {
            request.deny();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (pendingCameraRequest != null) {
            pendingCameraRequest.deny();
            pendingCameraRequest = null;
        }
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidDownloads");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private final class ImageDownloadBridge {
        @android.webkit.JavascriptInterface
        public void saveImage(String requestedName, String mimeType, String dataUrl) {
            try {
                if (!"image/jpeg".equals(mimeType) && !"image/png".equals(mimeType)) {
                    throw new IllegalArgumentException("Only JPEG and PNG images can be saved.");
                }
                if (dataUrl == null || dataUrl.length() > 24 * 1024 * 1024) {
                    throw new IllegalArgumentException("The image is too large to save.");
                }
                String prefix = "data:" + mimeType + ";base64,";
                if (!dataUrl.startsWith(prefix)) {
                    throw new IllegalArgumentException("The image data was invalid.");
                }

                String safeName = requestedName == null ? "" : requestedName.replaceAll("[^A-Za-z0-9._-]", "-");
                if (safeName.isEmpty()) safeName = "iqra-image";
                if (!safeName.endsWith(".jpg") && !safeName.endsWith(".jpeg") && !safeName.endsWith(".png")) {
                    safeName += "image/png".equals(mimeType) ? ".png" : ".jpg";
                }
                byte[] image = Base64.decode(dataUrl.substring(prefix.length()), Base64.DEFAULT);
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, safeName);
                values.put(MediaStore.Images.Media.MIME_TYPE, mimeType);
                values.put(MediaStore.Images.Media.RELATIVE_PATH,
                        Environment.DIRECTORY_PICTURES + "/IQRA Gesture Lab");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);

                Uri imageUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (imageUri == null) throw new IllegalStateException("Could not create the image file.");
                try (OutputStream output = getContentResolver().openOutputStream(imageUri)) {
                    if (output == null) throw new IllegalStateException("Could not write the image file.");
                    output.write(image);
                } catch (Exception error) {
                    getContentResolver().delete(imageUri, null, null);
                    throw error;
                }

                ContentValues ready = new ContentValues();
                ready.put(MediaStore.Images.Media.IS_PENDING, 0);
                getContentResolver().update(imageUri, ready, null, null);
                showSaveMessage("Image saved to Pictures / IQRA Gesture Lab.");
            } catch (Exception error) {
                showSaveMessage("Could not save image: " + error.getMessage());
            }
        }

        @android.webkit.JavascriptInterface
        public void reportSaveError() {
            showSaveMessage("Could not prepare the image for saving.");
        }

        private void showSaveMessage(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show());
        }
    }
}

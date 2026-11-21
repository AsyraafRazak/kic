import { useCallback, useEffect, useRef, useState } from 'react';

const IDEAL_VIDEO_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

function cameraErrorMessage(error) {
  const isDenied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError';
  const isMissing = error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError';
  if (isDenied) {
    return 'Camera permission was declined. Allow camera access in your browser settings and try again.';
  }
  if (isMissing) {
    return 'No camera was found. Connect a webcam and try again.';
  }
  return 'We could not start your camera. Check that it is connected and not in use by another app.';
}

/** Manages browser `getUserMedia` camera stream lifecycle, cancellation, and errors. */
export default function useCameraStream() {
  const [stream, setStream] = useState(null);
  const [cameraState, setCameraState] = useState('idle');
  const [cameraError, setCameraError] = useState('');
  const cameraRequestRef = useRef(0);
  const streamRef = useRef(null);
  streamRef.current = stream;

  useEffect(() => () => {
    stream?.getTracks().forEach((track) => track.stop());
  }, [stream]);

  const clearCameraError = useCallback(() => {
    setCameraError('');
  }, []);

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    setCameraState('idle');
  }, []);

  const requestCamera = useCallback(async (deviceId) => {
    const requestId = ++cameraRequestRef.current;
    setCameraState('loading');
    setCameraError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is unavailable. Open this page in a modern browser over HTTPS or localhost.');
      setCameraState('error');
      return;
    }

    try {
      const videoConstraints = deviceId
        ? { deviceId: { exact: deviceId }, ...IDEAL_VIDEO_CONSTRAINTS }
        : { facingMode: 'user', ...IDEAL_VIDEO_CONSTRAINTS };

      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
      if (requestId !== cameraRequestRef.current) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }
      setStream(nextStream);
      setCameraState('ready');
    } catch (error) {
      if (requestId !== cameraRequestRef.current) return;
      setCameraError(cameraErrorMessage(error));
      setCameraState('error');
    }
  }, []);

  return {
    stream,
    cameraState,
    cameraError,
    requestCamera,
    stopCamera,
    clearCameraError,
  };
}

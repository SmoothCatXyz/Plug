import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import startupPosterUrl from "../assets/startup/plug-startup-mecha-cockpit-poster.png";
import startupVideoUrl from "../assets/startup/plug-startup-mecha-cockpit.mp4";
import "./startup-splash.css";

type StartupSplashProps = {
  onComplete: () => void;
};

export function StartupSplash({ onComplete }: StartupSplashProps): ReactElement {
  const [closing, setClosing] = useState(false);
  const [posterVisible, setPosterVisible] = useState(true);
  const completedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const complete = useCallback((): void => {
    if (completedRef.current) {
      return;
    }

    completedRef.current = true;
    setClosing(true);
    window.setTimeout(onComplete, 420);
  }, [onComplete]);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeoutMs = prefersReducedMotion ? 1200 : 16500;
    const timeoutId = window.setTimeout(complete, timeoutMs);
    const posterTimeoutId = window.setTimeout(() => setPosterVisible(false), prefersReducedMotion ? 1200 : 900);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(posterTimeoutId);
    };
  }, [complete]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    void video.play().catch(() => {
      // The poster and timeout fallback still keep launch from blocking.
    });
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
        complete();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [complete]);

  return (
    <section className={`startup-splash${closing ? " startup-splash--closing" : ""}`} aria-label="Plug startup animation">
      <div className="startup-splash__fallback" aria-hidden="true">
        Plug
      </div>
      <img
        className={`startup-splash__poster${posterVisible ? "" : " startup-splash__poster--hidden"}`}
        src={startupPosterUrl}
        alt=""
        aria-hidden="true"
      />
      <video
        ref={videoRef}
        className="startup-splash__video"
        src={startupVideoUrl}
        poster={startupPosterUrl}
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={complete}
        onError={complete}
      />
    </section>
  );
}

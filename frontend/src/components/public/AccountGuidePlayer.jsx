import React, { useRef, useState } from 'react';
import { Download, FileText, Play, RotateCcw, Volume2 } from 'lucide-react';
import guide from '../../content/account-guide.json';

export const videoSource = '/videos/alister-account-guide.mp4';
export const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
let elapsed = 0;
export const chapters = guide.scenes.map((scene) => {
  const chapter = { ...scene, start: elapsed };
  elapsed += scene.duration;
  return chapter;
});
export const guideDuration = elapsed;

export default function AccountGuidePlayer() {
  const videoRef = useRef(null);
  const [activeChapter, setActiveChapter] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const jumpToChapter = async (index) => {
    const video = videoRef.current;
    if (!video || !ready) return;
    video.currentTime = chapters[index].start;
    setActiveChapter(index);
    setError('');
    try {
      await video.play();
    } catch {
      setError('The chapter is selected. Press play in the video controls to continue.');
    }
  };

  const updateChapter = () => {
    const time = videoRef.current?.currentTime || 0;
    const index = chapters.findIndex((chapter) => time < chapter.start + chapter.duration);
    setActiveChapter(index === -1 ? chapters.length - 1 : index);
  };

  return (
    <>
      <div className="guide-player-layout">
        <section className="guide-video-section" aria-label="Account-opening video">
          <div className="guide-video-frame">
            <video
              ref={videoRef}
              controls
              playsInline
              preload="metadata"
              poster="/videos/alister-account-guide-poster.webp"
              aria-label="Alister Bank: account opening through first login"
              aria-describedby="guide-video-description"
              onLoadedMetadata={() => setReady(true)}
              onTimeUpdate={updateChapter}
              onError={() => {
                setReady(false);
                setError('The video could not be loaded. Try reloading this page, or use the transcript below.');
              }}
            >
              <source src={videoSource} type="video/mp4" />
              <track kind="captions" src="/videos/alister-account-guide.en.vtt" srcLang="en" label="English instructions" />
              Your browser does not support this video. Download the MP4 or read the transcript below.
            </video>
          </div>
          {error && <p className="guide-player-error" role="status">{error}</p>}
          <div className="guide-player-toolbar">
            <span><Volume2 size={16} aria-hidden="true" /> Soft instrumental · No voice-over</span>
            <a href={videoSource} download="Alister-Bank-Account-Opening-Guide.mp4"><Download size={17} aria-hidden="true" /> Download MP4</a>
          </div>
          <div className="guide-now-playing">
            <div>
              <p className="guide-eyebrow">In this chapter</p>
              <h2>{chapters[activeChapter].chapter}</h2>
              <p>{chapters[activeChapter].description}</p>
            </div>
            <button type="button" className="guide-icon-button" disabled={!ready} onClick={() => jumpToChapter(activeChapter)} aria-label="Replay current chapter">
              <RotateCcw size={19} aria-hidden="true" />
            </button>
          </div>
        </section>

        <nav className="guide-chapters" aria-label="Video chapters">
          <div className="guide-chapters-heading">
            <h2>The complete journey</h2>
            <span>{chapters.length} chapters</span>
          </div>
          <ol>
            {chapters.map((chapter, index) => (
              <li key={chapter.id}>
                <button
                  type="button"
                  onClick={() => jumpToChapter(index)}
                  disabled={!ready}
                  aria-current={activeChapter === index ? 'step' : undefined}
                  aria-label={`Play ${chapter.chapter} at ${formatTime(chapter.start)}`}
                  className={activeChapter === index ? 'is-active' : ''}
                >
                  <span className="guide-chapter-number" aria-hidden="true">{activeChapter === index ? <Play size={14} fill="currentColor" /> : String(index + 1).padStart(2, '0')}</span>
                  <span className="guide-chapter-name">{chapter.chapter}</span>
                  <span className="guide-chapter-time">{formatTime(chapter.start)}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      <section className="guide-transcript" aria-label="Video transcript">
        <details>
          <summary><span><FileText size={19} aria-hidden="true" /> Read the full transcript</span><span className="guide-transcript-hint">English</span></summary>
          <div className="guide-transcript-content">
            {chapters.map((chapter, index) => (
              <article key={chapter.id}>
                <button type="button" disabled={!ready} onClick={() => jumpToChapter(index)} aria-label={`Play ${chapter.chapter}`}>
                  {formatTime(chapter.start)}
                </button>
                <div><h3>{chapter.chapter}</h3><p>{chapter.transcript}</p></div>
              </article>
            ))}
            <a className="guide-text-link" href="/videos/alister-account-guide.en.srt" download><Download size={16} aria-hidden="true" /> Download English captions (.srt)</a>
          </div>
        </details>
      </section>
    </>
  );
}

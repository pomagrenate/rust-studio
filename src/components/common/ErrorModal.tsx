import { useState } from "react";
import { VscClose, VscCopy, VscCheck, VscChevronDown, VscChevronUp } from "react-icons/vsc";
import styles from "./ErrorModal.module.css";

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  stdout?: string;
  stderr?: string;
  errorDetails?: string;
  onRetry?: () => void;
}

export function ErrorModal({
  isOpen,
  onClose,
  title,
  message,
  stdout,
  stderr,
  errorDetails,
  onRetry,
}: ErrorModalProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const fullText = [
      `Error: ${message}`,
      errorDetails ? `Details: ${errorDetails}` : "",
      stdout ? `Stdout:\n${stdout}` : "",
      stderr ? `Stderr:\n${stderr}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleDetails = () => {
    setShowDetails(!showDetails);
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.errorIcon}>⚠</span>
            <h2>{title}</h2>
          </div>
          <button className={styles.closeButton} onClick={onClose} title="Close">
            <VscClose />
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.message}>{message}</div>

          {errorDetails && (
            <div className={styles.details}>{errorDetails}</div>
          )}

          {(stdout || stderr) && (
            <div className={styles.terminalSection}>
              <button
                className={styles.terminalToggle}
                onClick={toggleDetails}
              >
                {showDetails ? (
                  <>
                    <VscChevronUp />
                    Hide Details
                  </>
                ) : (
                  <>
                    <VscChevronDown />
                    Show Details
                  </>
                )}
              </button>

              {showDetails && (
                <div className={styles.terminal}>
                  {stdout && (
                    <div className={styles.terminalBlock}>
                      <div className={styles.terminalHeader}>
                        <span>Stdout</span>
                        <button
                          className={styles.copyButton}
                          onClick={handleCopy}
                          title="Copy to clipboard"
                        >
                          {copied ? <VscCheck /> : <VscCopy />}
                        </button>
                      </div>
                      <pre className={styles.terminalContent}>{stdout}</pre>
                    </div>
                  )}

                  {stderr && (
                    <div className={styles.terminalBlock}>
                      <div className={styles.terminalHeader}>
                        <span>Stderr</span>
                        <button
                          className={styles.copyButton}
                          onClick={handleCopy}
                          title="Copy to clipboard"
                        >
                          {copied ? <VscCheck /> : <VscCopy />}
                        </button>
                      </div>
                      <pre className={`${styles.terminalContent} ${styles.errorContent}`}>
                        {stderr}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className={styles.actions}>
            {onRetry && (
              <button className={styles.retryButton} onClick={onRetry}>
                Retry
              </button>
            )}
            <button className={styles.closeModalButton} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

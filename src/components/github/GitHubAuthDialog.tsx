import { useState } from "react";
import {
  VscClose,
  VscKey,
  VscCheck,
  VscError,
  VscLoading,
} from "react-icons/vsc";
import { githubStoreToken, githubValidateTokenFormat } from "../../ipc/github";
import styles from "./GitHubAuthDialog.module.css";

interface GitHubAuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: () => void;
}

export function GitHubAuthDialog({
  isOpen,
  onClose,
  onAuthSuccess,
}: GitHubAuthDialogProps) {
  const [token, setToken] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setToken(e.target.value);
    setError(null);
    setSuccess(false);
  };

  const handleSave = async () => {
    if (!token.trim()) {
      setError("Token cannot be empty");
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      // Validate token format
      await githubValidateTokenFormat(token);
      
      // Store the token
      await githubStoreToken(token);
      
      setSuccess(true);
      setTimeout(() => {
        onAuthSuccess();
        handleClose();
      }, 1000);
    } catch (err) {
      setError(err as string);
    } finally {
      setIsValidating(false);
    }
  };

  const handleClose = () => {
    setToken("");
    setError(null);
    setSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h2>GitHub Authentication</h2>
          <button
            className={styles.closeButton}
            onClick={handleClose}
            title="Close"
          >
            <VscClose />
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.description}>
            <p>
              Enter your GitHub Personal Access Token to enable GitHub integration
              features (Pull Requests, Issues, etc.).
            </p>
            <p className={styles.note}>
              <strong>Note:</strong> The token will be stored securely in your OS
              keyring.
            </p>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="token-input">
              <VscKey />
              Personal Access Token
            </label>
            <input
              id="token-input"
              type="password"
              className={styles.tokenInput}
              placeholder="ghp_... or github_pat_..."
              value={token}
              onChange={handleTokenChange}
              disabled={isValidating || success}
              autoFocus
            />
            <div className={styles.hint}>
              Token must start with <code>ghp_</code> (Classic) or{" "}
              <code>github_pat_</code> (Fine-grained)
            </div>
          </div>

          {error && (
            <div className={styles.error}>
              <VscError />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className={styles.success}>
              <VscCheck />
              <span>Token saved successfully!</span>
            </div>
          )}

          <div className={styles.actions}>
            <button
              className={styles.cancelButton}
              onClick={handleClose}
              disabled={isValidating || success}
            >
              Cancel
            </button>
            <button
              className={styles.saveButton}
              onClick={handleSave}
              disabled={!token.trim() || isValidating || success}
            >
              {isValidating ? (
                <>
                  <VscLoading className={styles.spinner} />
                  Validating...
                </>
              ) : success ? (
                <>
                  <VscCheck />
                  Saved
                </>
              ) : (
                "Save Token"
              )}
            </button>
          </div>

          <div className={styles.helpLinks}>
            <a
              href="https://github.com/settings/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.helpLink}
            >
              Create a Personal Access Token →
            </a>
            <a
              href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.helpLink}
            >
              Learn about PATs →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import {
  VscClose,
  VscKey,
  VscCheck,
  VscError,
  VscLoading,
  VscAccount,
} from "react-icons/vsc";
import { githubStoreToken, githubValidateTokenFormat, githubVerifyToken, githubGetToken, GitHubUser } from "../../ipc/github";
import styles from "./GitHubAuthDialog.module.css";

interface GitHubAuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: GitHubUser) => void;
}

export function GitHubAuthDialog({
  isOpen,
  onClose,
  onAuthSuccess,
}: GitHubAuthDialogProps) {
  const [token, setToken] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<GitHubUser | null>(null);

  useEffect(() => {
    if (isOpen) {
      githubGetToken()
        .then((existingToken) => {
          if (existingToken) {
            return githubVerifyToken(existingToken);
          }
          return null;
        })
        .then((user) => setCurrentUser(user))
        .catch(() => setCurrentUser(null));
    }
  }, [isOpen]);

  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setToken(e.target.value);
    setError(null);
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!token.trim()) {
      setError("Token cannot be empty");
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      // 1. Validate token format
      await githubValidateTokenFormat(token);

      // 2. Verify token against GitHub API
      const user = await githubVerifyToken(token);
      
      // 3. Store verified token securely in OS keyring
      await githubStoreToken(token);
      
      setSuccess(`Authenticated as @${user.login}!`);
      setTimeout(() => {
        onAuthSuccess(user);
        handleClose();
      }, 600);
    } catch (err) {
      setError(err as string);
    } finally {
      setIsValidating(false);
    }
  };

  const handleClose = () => {
    setToken("");
    setError(null);
    setSuccess(null);
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
            {currentUser ? (
              <div style={{ padding: "8px 12px", backgroundColor: "rgba(0,122,204,0.15)", border: "1px solid #007acc", borderRadius: "6px", marginBottom: "12px", fontSize: "12px", color: "#ffffff" }}>
                <strong style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <VscAccount /> Active Session: @{currentUser.login}
                </strong>
                Paste a new token below to replace or update your current credential.
              </div>
            ) : (
              <p>
                Enter your GitHub Personal Access Token to enable GitHub integration
                features (Pull Requests, Issues, etc.).
              </p>
            )}
            <p className={styles.note}>
              <strong>Note:</strong> The token will be verified against GitHub and stored securely in your OS keyring.
            </p>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="token-input">
              <VscKey />
              {currentUser ? "New Personal Access Token" : "Personal Access Token"}
            </label>
            <input
              id="token-input"
              type="password"
              className={styles.tokenInput}
              placeholder="ghp_... or github_pat_..."
              value={token}
              onChange={handleTokenChange}
              disabled={isValidating || Boolean(success)}
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
              <span>{success}</span>
            </div>
          )}

          <div className={styles.actions}>
            <button
              className={styles.cancelButton}
              onClick={handleClose}
              disabled={isValidating || Boolean(success)}
            >
              Cancel
            </button>
            <button
              className={styles.saveButton}
              onClick={handleSave}
              disabled={!token.trim() || isValidating || Boolean(success)}
            >
              {isValidating ? (
                <>
                  <VscLoading className={styles.spinner} />
                  Validating...
                </>
              ) : success ? (
                <>
                  <VscCheck />
                  Verified
                </>
              ) : currentUser ? (
                "Update Token"
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

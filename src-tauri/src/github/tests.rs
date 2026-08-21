//! github/tests.rs — Unit tests for GitCommandResult error parsing and GitHub structures.

use super::error::GitCommandResult;

fn mock_output(status_code: i32, stdout: &[u8], stderr: &[u8]) -> std::process::Output {
    #[cfg(windows)]
    let status = std::os::windows::process::ExitStatusExt::from_raw(status_code as u32);
    #[cfg(not(windows))]
    let status = std::os::unix::process::ExitStatusExt::from_raw(status_code);

    std::process::Output {
        status,
        stdout: stdout.to_vec(),
        stderr: stderr.to_vec(),
    }
}

#[test]
fn test_git_command_result_success() {
    let res = GitCommandResult::success("Switched to branch 'main'".to_string());
    assert!(res.success);
    assert_eq!(res.stdout, "Switched to branch 'main'");
    assert!(res.stderr.is_empty());
    assert!(res.error_message.is_none());
    assert!(res.to_string().contains("Success: Switched to branch 'main'"));
}

#[test]
fn test_git_command_result_error_parsing() {
    // 1. Permission denied
    let res1 = GitCommandResult::from_command_output(mock_output(1, b"", b"Permission denied (publickey)."));
    assert!(!res1.success);
    assert!(res1.error_message.unwrap().contains("Authentication failed"));

    // 2. Remote read failure
    let res2 = GitCommandResult::from_command_output(mock_output(1, b"", b"fatal: Could not read from remote repository."));
    assert!(!res2.success);
    assert!(res2.error_message.unwrap().contains("Network error"));

    // 3. Non-fast-forward push
    let res3 = GitCommandResult::from_command_output(mock_output(1, b"", b"error: failed to push some refs (non-fast-forward)"));
    assert!(!res3.success);
    assert!(res3.error_message.unwrap().contains("Push rejected"));

    // 4. Merge conflict
    let res4 = GitCommandResult::from_command_output(mock_output(1, b"", b"Automatic merge failed; fix merge conflict and commit"));
    assert!(!res4.success);
    assert!(res4.error_message.unwrap().contains("Merge conflict detected"));

    // 5. HTTP 401 Bad credentials
    let res5 = GitCommandResult::from_command_output(mock_output(1, b"", b"HTTP 401 Bad credentials"));
    assert!(!res5.success);
    assert!(res5.error_message.unwrap().contains("Invalid GitHub credentials"));

    // 6. HTTP 404
    let res6 = GitCommandResult::from_command_output(mock_output(1, b"", b"HTTP 404 Not Found"));
    assert!(!res6.success);
    assert!(res6.error_message.unwrap().contains("Repository not found"));

    // 7. HTTP 403
    let res7 = GitCommandResult::from_command_output(mock_output(1, b"", b"HTTP 403 Forbidden"));
    assert!(!res7.success);
    assert!(res7.error_message.unwrap().contains("Access denied"));
}

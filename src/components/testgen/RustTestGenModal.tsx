/**
 * RustTestGenModal.tsx — Pure Rust AST Deterministic Test Generator UI
 *
 * Uses Rust AST compiler analysis (syn/quote) to synthesize 100% compile-ready
 * unit tests, tokio async tests, proptest property tests, and boundary value checks
 * directly into the developer's Rust workspace.
 */

import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  VscBeaker,
  VscClose,
  VscCheck,
  VscCopy,
  VscPlay,
  VscSymbolMethod,
} from "react-icons/vsc";
import { useTheme } from "../../hooks/useTheme";
import styles from "./RustTestGenModal.module.css";

export interface RustTestOptions {
  generate_unit_tests: boolean;
  generate_error_paths: boolean;
  generate_async_tokio: boolean;
  generate_proptest: boolean;
  generate_boundary_checks: boolean;
  generate_benchmarks: boolean;
  generate_doc_tests: boolean;
}

export interface RustTestCase {
  id: string;
  fn_name: string;
  test_name: string;
  test_type: string;
  code: string;
}

export interface RustGeneratedTestSuite {
  source_file: string;
  total_functions_parsed: number;
  test_cases: RustTestCase[];
  combined_mod_tests_code: string;
}

export interface RustTestGenModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeFilePath?: string;
  onRunCargoTest?: () => void;
}

export const RustTestGenModal: React.FC<RustTestGenModalProps> = ({
  isOpen,
  onClose,
  activeFilePath = "",
  onRunCargoTest,
}) => {
  const { theme } = useTheme();
  const isLight = theme !== "dark";

  const [options, setOptions] = useState<RustTestOptions>({
    generate_unit_tests: true,
    generate_error_paths: true,
    generate_async_tokio: true,
    generate_proptest: true,
    generate_boundary_checks: true,
    generate_benchmarks: false,
    generate_doc_tests: true,
  });

  const [suite, setSuite] = useState<RustGeneratedTestSuite | null>(null);
  const [isInjecting, setIsInjecting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  const generateTests = useCallback(async () => {
    if (!activeFilePath || !activeFilePath.endsWith(".rs")) {
      setStatusMsg("Please open a valid .rs file to generate tests.");
      return;
    }

    setStatusMsg("");

    try {
      const res = await invoke<RustGeneratedTestSuite>("generate_rust_tests", {
        filePath: activeFilePath,
        options,
      });
      setSuite(res);
      setStatusMsg(
        `Parsed ${res.total_functions_parsed} functions. Synthesized ${res.test_cases.length} tests.`
      );
    } catch (err) {
      console.error("[RustTestGen] Generation error:", err);
      setStatusMsg(`Error parsing AST: ${err}`);
    }
  }, [activeFilePath, options]);

  useEffect(() => {
    if (isOpen && activeFilePath) {
      generateTests();
    }
  }, [isOpen, activeFilePath, generateTests]);

  const handleOptionToggle = (key: keyof RustTestOptions) => {
    setOptions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleCopyCode = () => {
    if (!suite?.combined_mod_tests_code) return;
    navigator.clipboard.writeText(suite.combined_mod_tests_code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleInjectTests = async () => {
    if (!suite?.combined_mod_tests_code || !activeFilePath) return;

    setIsInjecting(true);
    setStatusMsg("");

    try {
      await invoke("inject_rust_tests_to_file", {
        filePath: activeFilePath,
        testCode: suite.combined_mod_tests_code,
      });
      setStatusMsg("Successfully injected `mod tests` into active Rust file!");
    } catch (err) {
      console.error("[RustTestGen] Inject error:", err);
      setStatusMsg(`Inject error: ${err}`);
    } finally {
      setIsInjecting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={isLight ? styles.modalLight : styles.modalDark}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={isLight ? styles.headerLight : styles.headerDark}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <VscBeaker size={22} />
            </div>
            <h2 className={isLight ? styles.titleLight : styles.titleDark}>
              Rust AST Test Generator (Pomai TestGen)
            </h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <VscClose size={20} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {statusMsg && (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                fontSize: 12.5,
                fontWeight: 500,
                backgroundColor: isLight ? "#ddf4ff" : "#1f3a5f",
                color: isLight ? "#0969da" : "#58a6ff",
                border: isLight ? "1px solid #54aefd" : "1px solid #388bfd",
              }}
            >
              {statusMsg}
            </div>
          )}

          {/* Test Options Card */}
          <div className={isLight ? styles.optionsCardLight : styles.optionsCardDark}>
            <div className={styles.optionsTitle}>
              <VscBeaker /> Test Generation Options (Non-AI AST Synthesizer)
            </div>
            <div className={styles.checkboxGrid}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={options.generate_unit_tests}
                  onChange={() => handleOptionToggle("generate_unit_tests")}
                />
                Standard Unit Tests (#[test])
              </label>

              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={options.generate_error_paths}
                  onChange={() => handleOptionToggle("generate_error_paths")}
                />
                Result/Option Error Paths
              </label>

              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={options.generate_async_tokio}
                  onChange={() => handleOptionToggle("generate_async_tokio")}
                />
                Tokio Async Tests (#[tokio::test])
              </label>

              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={options.generate_boundary_checks}
                  onChange={() => handleOptionToggle("generate_boundary_checks")}
                />
                Boundary Value Limits (0, MAX, "")
              </label>

              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={options.generate_proptest}
                  onChange={() => handleOptionToggle("generate_proptest")}
                />
                Proptest Fuzzing (proptest!)
              </label>

              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={options.generate_benchmarks}
                  onChange={() => handleOptionToggle("generate_benchmarks")}
                />
                Benchmark Stubs (#[bench])
              </label>
            </div>
          </div>

          {/* Generated Code Preview */}
          <div className={styles.codeSection}>
            <div className={styles.codeHeader}>
              <span>
                <VscSymbolMethod /> Generated `mod tests` ({suite?.test_cases.length || 0} Test Cases)
              </span>
              <button
                className={isLight ? styles.btnSecondaryLight : styles.btnSecondaryDark}
                onClick={handleCopyCode}
                style={{ padding: "4px 8px", fontSize: 11.5 }}
              >
                {isCopied ? <VscCheck /> : <VscCopy />} {isCopied ? "Copied!" : "Copy Code"}
              </button>
            </div>

            <pre className={isLight ? styles.codeBlockLight : styles.codeBlockDark}>
              {suite?.combined_mod_tests_code || "// Generating Rust tests from AST..."}
            </pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div className={styles.footer}>
          <button
            className={isLight ? styles.btnSecondaryLight : styles.btnSecondaryDark}
            onClick={() => {
              if (onRunCargoTest) {
                onRunCargoTest();
                onClose();
              }
            }}
          >
            <VscPlay /> Run `cargo test` in Terminal
          </button>

          <button
            className={styles.btnPrimary}
            onClick={handleInjectTests}
            disabled={isInjecting || !suite?.combined_mod_tests_code}
          >
            <VscBeaker /> {isInjecting ? "Injecting..." : "Inject `mod tests` into File"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RustTestGenModal;

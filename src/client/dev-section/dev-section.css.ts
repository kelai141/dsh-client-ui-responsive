/**
 * 开发者选项设置页样式：复用 --dsw-* 语义 token（浅/深色自动跟随），
 * 按钮行式布局；窄屏（移动形态）按钮全宽堆叠、行内换行。
 * 注入方式与 mobile-settings.css.ts 一致（data-plugin 选择器，防 class 哈希）。
 */
export const DEV_SECTION_CSS: string = `
[data-plugin='dev-section'] {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0 12px;
}

.dsh-dev-note {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary, #666);
}

.dsh-dev-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.dsh-dev-btn {
  min-height: 36px;
  padding: 6px 14px;
  border: 1px solid var(--dsw-alias-border-strong, #ccc);
  border-radius: 8px;
  background: var(--dsw-alias-bg-elevated, #fff);
  color: var(--dsw-alias-label-primary, #222);
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}

.dsh-dev-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.dsh-dev-danger {
  border-color: var(--dsw-alias-danger-fg, #c0392b);
  color: var(--dsw-alias-danger-fg, #c0392b);
}

.dsh-dev-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  padding: 20px;
}

.dsh-dev-modal {
  width: 100%;
  max-width: 360px;
  padding: 18px 20px;
  border: 1px solid var(--dsw-alias-border-strong, #ccc);
  border-radius: 12px;
  background: var(--dsw-alias-bg-elevated, #fff);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.25);
}

.dsh-dev-modal-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #222);
}

.dsh-dev-modal-desc {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary, #666);
}

.dsh-dev-modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.dsh-dev-switch {
  font-size: 14px;
  color: var(--dsw-alias-label-primary, #222);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.dsh-dev-switch input {
  width: 16px;
  height: 16px;
  margin: 0;
}

.dsh-dev-hint {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #666);
}

.dsh-dev-warn {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-danger-fg, #c0392b);
}

/* 深色主题兜底（#43，2026-08-18）：部分环境 --dsw-alias-bg-elevated 未定义
 * 会回退 #fff（白底），而 label-primary 在深色下为白字 → 白底白字。
 * 为不确定存在的 token 提供与主题一致的显式兜底。 */
@media (prefers-color-scheme: dark) {
  .dsh-dev-btn {
    background: var(--dsw-alias-bg-elevated, #26262b);
    color: var(--dsw-alias-label-primary, #f2f2f4);
    border-color: var(--dsw-alias-border-strong, #55555c);
  }
  .dsh-dev-note, .dsh-dev-hint {
    color: var(--dsw-alias-label-secondary, #c9c9cf);
  }
  .dsh-dev-warn {
    color: var(--dsw-alias-danger-fg, #ff9c9c);
  }
  .dsh-dev-danger {
    border-color: var(--dsw-alias-danger-fg, #ff9c9c);
    color: var(--dsw-alias-danger-fg, #ff9c9c);
  }
  .dsh-dev-modal {
    background: var(--dsw-alias-bg-elevated, #26262b);
    border-color: var(--dsw-alias-border-strong, #55555c);
  }
  .dsh-dev-modal-title {
    color: var(--dsw-alias-label-primary, #f2f2f4);
  }
  .dsh-dev-modal-desc {
    color: var(--dsw-alias-label-secondary, #c9c9cf);
  }
}

@media (max-width: 639px) {
  .dsh-dev-btn {
    flex: 1 1 calc(50% - 5px);
    text-align: center;
  }
}
`

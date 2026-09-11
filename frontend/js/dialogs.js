/**
 * Vibeathon 2026 - Unified Cyber Dialog & Toast Notification Library
 * Provides rich, dark-futuristic modal confirmations, alerts, and toasts.
 */

(function () {
  'use strict';

  // Ensure DOM container for dialogs exists
  let dialogContainer = null;
  let toastContainer = null;

  function ensureContainers() {
    if (!dialogContainer) {
      dialogContainer = document.getElementById('cyberDialogContainer');
      if (!dialogContainer) {
        dialogContainer = document.createElement('div');
        dialogContainer.id = 'cyberDialogContainer';
        document.body.appendChild(dialogContainer);
      }
    }

    if (!toastContainer) {
      toastContainer = document.getElementById('cyberToastContainer');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'cyberToastContainer';
        toastContainer.className = 'cyber-toast-container';
        document.body.appendChild(toastContainer);
      }
    }
  }

  // Icons lookup by type
  const ICON_MAP = {
    warning: 'fas fa-exclamation-triangle',
    danger: 'fas fa-trash-alt',
    error: 'fas fa-times-circle',
    info: 'fas fa-info-circle',
    success: 'fas fa-check-circle',
    robot: 'fas fa-robot',
    clock: 'fas fa-history'
  };

  /**
   * Shows a futuristic confirmation dialog.
   * @param {Object} opts
   * @param {string} [opts.title='Confirmation Required']
   * @param {string} opts.message - Primary message
   * @param {string} [opts.details] - Optional subtext or explanation
   * @param {'warning'|'danger'|'info'|'success'|'error'} [opts.type='warning']
   * @param {string} [opts.confirmText='Confirm']
   * @param {string} [opts.cancelText='Cancel']
   * @param {string} [opts.icon] - FontAwesome icon class override
   * @returns {Promise<boolean>} Resolves to true if user clicks confirm, false otherwise
   */
  window.showConfirmDialog = function (opts = {}) {
    ensureContainers();

    return new Promise((resolve) => {
      const type = opts.type || 'warning';
      const title = opts.title || (type === 'danger' ? 'Confirm Destructive Action' : 'Action Confirmation');
      const message = opts.message || 'Are you sure you want to proceed?';
      const details = opts.details || '';
      const confirmText = opts.confirmText || (type === 'danger' ? 'Delete' : 'Confirm');
      const cancelText = opts.cancelText || 'Cancel';
      const iconClass = opts.icon || ICON_MAP[type] || 'fas fa-question-circle';

      const overlay = document.createElement('div');
      overlay.className = 'cyber-dialog-overlay';

      const detailsHtml = details ? `<div class="cyber-dialog-details">${escapeHtml(details)}</div>` : '';

      overlay.innerHTML = `
        <div class="cyber-dialog-card type-${type}">
          <div class="cyber-dialog-icon">
            <i class="${iconClass}"></i>
          </div>
          <div class="cyber-dialog-title">${escapeHtml(title)}</div>
          <div class="cyber-dialog-message">${escapeHtml(message)}</div>
          ${detailsHtml}
          <div class="cyber-dialog-actions">
            <button type="button" class="cyber-btn-cancel" id="cyberCancelBtn">
              <i class="fas fa-times"></i> ${escapeHtml(cancelText)}
            </button>
            <button type="button" class="cyber-btn-confirm" id="cyberConfirmBtn">
              <i class="fas fa-check"></i> ${escapeHtml(confirmText)}
            </button>
          </div>
        </div>
      `;

      dialogContainer.appendChild(overlay);

      // Force reflow for animation
      void overlay.offsetWidth;
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';

      const cancelBtn = overlay.querySelector('#cyberCancelBtn');
      const confirmBtn = overlay.querySelector('#cyberConfirmBtn');

      function cleanup(result) {
        window.removeEventListener('keydown', keyHandler);
        overlay.classList.remove('show');
        document.body.style.overflow = '';
        setTimeout(() => {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 250);
        resolve(result);
      }

      function keyHandler(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup(false);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          cleanup(true);
        }
      }

      window.addEventListener('keydown', keyHandler);

      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cleanup(false);
      });

      confirmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cleanup(true);
      });

      // Clicking backdrop cancels
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cleanup(false);
        }
      });

      // Focus confirm button for accessibility
      setTimeout(() => {
        if (confirmBtn) confirmBtn.focus();
      }, 50);
    });
  };

  /**
   * Shows a futuristic alert dialog (single button acknowledgment).
   * @param {Object|string} opts - Options object or message string
   * @returns {Promise<void>}
   */
  window.showAlertDialog = function (opts = {}) {
    ensureContainers();

    if (typeof opts === 'string') {
      opts = { message: opts };
    }

    return new Promise((resolve) => {
      const type = opts.type || 'info';
      const title = opts.title || (type === 'error' ? 'Error Notice' : 'System Notice');
      const message = opts.message || '';
      const details = opts.details || '';
      const buttonText = opts.buttonText || 'Acknowledge';
      const iconClass = opts.icon || ICON_MAP[type] || 'fas fa-info-circle';

      const overlay = document.createElement('div');
      overlay.className = 'cyber-dialog-overlay';

      const detailsHtml = details ? `<div class="cyber-dialog-details">${escapeHtml(details)}</div>` : '';

      overlay.innerHTML = `
        <div class="cyber-dialog-card type-${type}">
          <div class="cyber-dialog-icon">
            <i class="${iconClass}"></i>
          </div>
          <div class="cyber-dialog-title">${escapeHtml(title)}</div>
          <div class="cyber-dialog-message">${escapeHtml(message)}</div>
          ${detailsHtml}
          <div class="cyber-dialog-actions single">
            <button type="button" class="cyber-btn-confirm" id="cyberAckBtn">
              <i class="fas fa-check"></i> ${escapeHtml(buttonText)}
            </button>
          </div>
        </div>
      `;

      dialogContainer.appendChild(overlay);

      void overlay.offsetWidth;
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';

      const ackBtn = overlay.querySelector('#cyberAckBtn');

      function cleanup() {
        window.removeEventListener('keydown', keyHandler);
        overlay.classList.remove('show');
        document.body.style.overflow = '';
        setTimeout(() => {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 250);
        resolve();
      }

      function keyHandler(e) {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          cleanup();
        }
      }

      window.addEventListener('keydown', keyHandler);

      ackBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cleanup();
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup();
      });

      setTimeout(() => {
        if (ackBtn) ackBtn.focus();
      }, 50);
    });
  };

  /**
   * Unified toast notifications across all pages
   * @param {string} message
   * @param {'info'|'success'|'error'|'warning'} [type='info']
   * @param {number} [duration=4000]
   */
  window.showToast = function (message, type = 'info', duration = 4000) {
    ensureContainers();

    const toast = document.createElement('div');
    toast.className = `cyber-toast ${type}`;

    const iconClass = ICON_MAP[type] || 'fas fa-info-circle';

    toast.innerHTML = `
      <div class="cyber-toast-icon"><i class="${iconClass}"></i></div>
      <div class="cyber-toast-msg">${escapeHtml(message)}</div>
      <button class="cyber-toast-close" title="Dismiss">&times;</button>
    `;

    toastContainer.appendChild(toast);

    let dismissTimer = setTimeout(() => {
      dismiss();
    }, duration);

    function dismiss() {
      if (dismissTimer) clearTimeout(dismissTimer);
      toast.classList.add('dismissing');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 260);
    }

    const closeBtn = toast.querySelector('.cyber-toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismiss();
      });
    }

    toast.addEventListener('mouseenter', () => {
      if (dismissTimer) clearTimeout(dismissTimer);
    });

    toast.addEventListener('mouseleave', () => {
      dismissTimer = setTimeout(dismiss, 2000);
    });
  };

  /**
   * Overwrite standard window.alert to automatically route through modern cyber dialog
   */
  const originalAlert = window.alert;
  window.alert = function (message) {
    // If it's a short simple message, toast is less intrusive; for multi-line, modal alert
    const msgStr = String(message || '');
    if (msgStr.includes('\n') || msgStr.length > 80) {
      window.showAlertDialog({
        title: 'System Notice',
        message: msgStr.split('\n')[0],
        details: msgStr.includes('\n') ? msgStr.split('\n').slice(1).join('\n').trim() : '',
        type: 'info'
      });
    } else {
      window.showToast(msgStr, 'info');
    }
  };

  function escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, (m) => map[m]);
  }

  // Ensure initialization when DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureContainers);
  } else {
    ensureContainers();
  }

})();

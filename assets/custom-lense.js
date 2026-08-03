/**
 * Multi-step Contact Lens prescription popup.
 * Opens via .open-model → adds .active on .lense-model-content.
 * Config comes from product metafield custom.contact_lenses (no hardcoded values).
 */
class CustomLensePopup {
  static STEPS = [
    { id: 1, title: 'Select Contact Lens Type', label: 'Step 1 of 4', continueLabel: 'Continue' },
    { id: 2, title: 'Choose Prescription Method', label: 'Step 2 of 4', continueLabel: 'Continue' },
    { id: 3, title: 'Enter Prescription Details', label: 'Step 3 of 4', continueLabel: 'Continue' },
    { id: 4, title: 'Review & Add to Cart', label: 'Step 4 of 4', continueLabel: 'Save & Continue' },
  ];

  static METHODS = [
    {
      id: 'upload',
      title: 'Upload Prescription',
      description: 'Upload a photo or PDF of your prescription',
    },
    {
      id: 'manual',
      title: 'Enter Prescription Manually',
      description: 'Fill in your right and left eye values',
    },
    {
      id: 'saved',
      title: 'Use Saved Prescription',
      description: 'Apply a prescription saved to your account',
      requiresLogin: true,
    },
  ];

  constructor(root) {
    this.root = root;
    this.config = this.parseConfig();
    this.modal = root.querySelector('.lense-model-content');
    this.body = root.querySelector('[data-lense-body]');
    this.openBtn = root.querySelector('.open-model');
    this.backBtn = root.querySelector('[data-lense-back]');
    this.continueBtn = root.querySelector('[data-lense-continue]');
    this.titleEl = root.querySelector('[data-lense-title]');
    this.stepLabelEl = root.querySelector('[data-lense-step-label]');
    this.progressBar = root.querySelector('[data-lense-progress-bar]');
    this.errorEl = root.querySelector('[data-lense-error]');
    this.productFormId = root.dataset.productFormId;
    this.step = 1;
    this.state = this.defaultState();
    this.boundKeyHandler = this.onKeydown.bind(this);

    if (!this.config || !this.modal || !this.openBtn) return;

    this.config.lensTypes = (this.config.lensTypes || []).map((lens) => ({
      ...lens,
      fields: this.normalizeFields(lens.fields || []),
    }));

    this.bindEvents();
  }

  defaultState() {
    return {
      lensTypeId: null,
      method: null,
      prescription: { od: {}, os: {}, shared: {} },
      uploadFileName: '',
      quantity: 1,
      sameAsRight: false,
    };
  }

  parseConfig() {
    const el = this.root.querySelector('[data-lense-config]');
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      console.error('Custom Lense: invalid config JSON', e);
      return null;
    }
  }

  normalizeFields(fields) {
    return fields
      .map((field) => ({
        key: String(field.key || '').trim(),
        label: String(field.label || field.key || '').trim(),
        scope: field.scope === 'shared' ? 'shared' : 'eye',
        values: this.normalizeValues(field.values),
      }))
      .filter((field) => field.key && field.values.length);
  }

  normalizeValues(raw) {
    const toLabel = (v) => {
      if (v == null) return '';
      if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
      if (typeof v === 'object') {
        return String(
          v.value ?? v.label ?? v.name ?? v.title ?? v.handle ?? ''
        ).trim();
      }
      return String(v).trim();
    };

    if (Array.isArray(raw)) {
      return raw.map(toLabel).filter(Boolean);
    }
    if (typeof raw === 'string') {
      return raw
        .split(/[\n,]+/)
        .map((v) => v.trim())
        .filter(Boolean);
    }
    if (raw && typeof raw === 'object') {
      return Object.values(raw).map(toLabel).filter(Boolean);
    }
    return [];
  }

  bindEvents() {
    this.openBtn.addEventListener('click', (event) => {
      event.preventDefault();
      this.open();
    });

    this.root.querySelectorAll('.lense-model-close').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.close();
      });
    });

    this.backBtn?.addEventListener('click', () => this.goBack());
    this.continueBtn?.addEventListener('click', () => this.goNext());

    this.boundOutsideClose = this.onOutsideClose.bind(this);
    this.modal.addEventListener('mousedown', this.boundOutsideClose);
    this.modal.addEventListener('touchstart', this.boundOutsideClose, { passive: true });
  }

  onOutsideClose(event) {
    if (!this.modal.classList.contains('active')) return;

    const dialog = this.modal.querySelector('.lense-model-dialog');
    // Close only when the press is outside the dialog panel
    if (dialog && dialog.contains(event.target)) return;

    this.close();
  }

  getSelectedLens() {
    return this.config.lensTypes.find((l) => String(l.id) === String(this.state.lensTypeId)) || null;
  }

  getVariantId() {
    const form = this.productFormId ? document.getElementById(this.productFormId) : null;
    const input = form?.querySelector('[name="id"]') || document.querySelector('product-form [name="id"]');
    return input?.value || this.config.variantId;
  }

  open() {
    this.step = 1;
    this.state = this.defaultState();
    this.clearError();
    this.renderStep();

    // Move overlay to <body> so sticky/transform parents cannot trap fixed positioning
    if (this.modal.parentElement !== document.body) {
      this.modalPlaceholder = document.createComment('lense-model-placeholder');
      this.modal.parentNode?.insertBefore(this.modalPlaceholder, this.modal);
      document.body.appendChild(this.modal);
    }

    this.modal.removeAttribute('hidden');
    this.modal.classList.add('active');
    document.body.classList.add('lense-model-open');
    document.addEventListener('keydown', this.boundKeyHandler);
  }

  close() {
    if (!this.modal) return;

    this.modal.classList.remove('active');
    this.modal.setAttribute('hidden', '');
    document.body.classList.remove('lense-model-open');
    document.removeEventListener('keydown', this.boundKeyHandler);

    if (this.modalPlaceholder?.parentNode) {
      this.modalPlaceholder.parentNode.insertBefore(this.modal, this.modalPlaceholder);
      this.modalPlaceholder.remove();
      this.modalPlaceholder = null;
    }

    this.openBtn?.focus({ preventScroll: true });
  }

  onKeydown(event) {
    if (event.key === 'Escape') this.close();
  }

  goBack() {
    if (this.step <= 1) return;
    if (this.step === 4 && this.state.method === 'upload') {
      this.step = 2;
    } else if (this.step === 4 && this.state.method === 'saved') {
      this.step = 2;
    } else {
      this.step -= 1;
    }
    this.clearError();
    this.renderStep();
  }

  async goNext() {
    if (!this.validateStep()) return;

    if (this.step === 4) {
      await this.addToCart();
      return;
    }

    if (this.step === 2 && this.state.method === 'upload') {
      this.step = 4;
    } else if (this.step === 2 && this.state.method === 'saved') {
      this.applySavedPrescription();
      this.step = 4;
    } else {
      this.step += 1;
    }

    this.clearError();
    this.renderStep();
  }

  validateStep() {
    this.clearError();

    if (this.step === 1 && !this.state.lensTypeId) {
      this.showError('Please select a contact lens type.');
      return false;
    }

    if (this.step === 2 && !this.state.method) {
      this.showError('Please choose how you want to provide your prescription.');
      return false;
    }

    if (this.step === 2 && this.state.method === 'upload' && !this.state.uploadFileName) {
      this.showError('Please upload your prescription file.');
      return false;
    }

    if (this.step === 2 && this.state.method === 'saved') {
      if (!this.config.customerLoggedIn) {
        this.showError('Please log in to use a saved prescription.');
        return false;
      }
      if (!this.config.savedPrescription) {
        this.showError('No saved prescription found on your account.');
        return false;
      }
    }

    if (this.step === 3 || (this.step === 4 && this.state.method !== 'upload')) {
      if (!this.validatePrescriptionFields()) return false;
    }

    if (this.step === 4) {
      const qty = Number(this.state.quantity);
      if (!Number.isFinite(qty) || qty < 1) {
        this.showError('Please enter a valid quantity.');
        return false;
      }
    }

    return true;
  }

  validatePrescriptionFields() {
    const lens = this.getSelectedLens();
    if (!lens) {
      this.showError('Lens type configuration is missing.');
      return false;
    }

    if (!lens.fields.length) {
      this.showError('No prescription fields are configured for this lens type.');
      return false;
    }

    for (const field of lens.fields) {
      if (field.scope === 'shared') {
        if (!this.state.prescription.shared[field.key]) {
          this.showError(`Please select ${field.label}.`);
          return false;
        }
      } else {
        if (!this.state.prescription.od[field.key]) {
          this.showError(`Please select Right Eye (OD) ${field.label}.`);
          return false;
        }
        if (!this.state.prescription.os[field.key]) {
          this.showError(`Please select Left Eye (OS) ${field.label}.`);
          return false;
        }
      }
    }

    return true;
  }

  applySavedPrescription() {
    const saved = this.config.savedPrescription;
    if (!saved || typeof saved !== 'object') return;

    if (saved.od) this.state.prescription.od = { ...saved.od };
    if (saved.os) this.state.prescription.os = { ...saved.os };
    if (saved.shared) this.state.prescription.shared = { ...saved.shared };

    // Flat fallback: OD SPH / OS SPH style keys
    Object.entries(saved).forEach(([key, value]) => {
      if (['od', 'os', 'shared', 'lensType', 'quantity'].includes(key)) return;
      const match = key.match(/^(od|os)\s*[_-]?\s*(.+)$/i);
      if (match) {
        const eye = match[1].toLowerCase();
        const fieldKey = match[2].trim().toLowerCase().replace(/\s+/g, '_');
        this.state.prescription[eye][fieldKey] = String(value);
        return;
      }
      this.state.prescription.shared[key] = String(value);
    });
  }

  showError(message) {
    if (!this.errorEl) return;
    this.errorEl.hidden = false;
    this.errorEl.textContent = message;
  }

  clearError() {
    if (!this.errorEl) return;
    this.errorEl.hidden = true;
    this.errorEl.textContent = '';
  }

  updateChrome() {
    const meta = CustomLensePopup.STEPS[this.step - 1];
    if (this.titleEl) this.titleEl.textContent = meta.title;
    if (this.stepLabelEl) this.stepLabelEl.textContent = meta.label;
    if (this.progressBar) this.progressBar.style.width = `${(this.step / 4) * 100}%`;
    if (this.backBtn) this.backBtn.hidden = this.step === 1;
    if (this.continueBtn) {
      this.continueBtn.textContent = meta.continueLabel;
      this.continueBtn.disabled = !this.canContinue();
      this.continueBtn.classList.toggle('loading', false);
    }
  }

  canContinue() {
    if (this.step === 1) return Boolean(this.state.lensTypeId);
    if (this.step === 2) {
      if (!this.state.method) return false;
      if (this.state.method === 'upload') return Boolean(this.state.uploadFileName);
      if (this.state.method === 'saved') {
        return this.config.customerLoggedIn && Boolean(this.config.savedPrescription);
      }
      return true;
    }
    return true;
  }

  renderStep() {
    this.updateChrome();
    if (!this.body) return;

    switch (this.step) {
      case 1:
        this.body.innerHTML = this.renderStep1();
        this.bindStep1();
        break;
      case 2:
        this.body.innerHTML = this.renderStep2();
        this.bindStep2();
        break;
      case 3:
        this.body.innerHTML = this.renderStep3();
        this.bindStep3();
        break;
      case 4:
        this.body.innerHTML = this.renderStep4();
        this.bindStep4();
        break;
      default:
        break;
    }

    this.updateChrome();
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  renderStep1() {
    const options = this.config.lensTypes
      .map((lens) => {
        const selected = String(this.state.lensTypeId) === String(lens.id);
        const image = lens.image
          ? `<img src="${this.escapeHtml(lens.image)}" alt="" width="48" height="48" loading="lazy">`
          : `<span class="lense-option__icon" aria-hidden="true"></span>`;
        return `
          <label class="lense-option ${selected ? 'is-selected' : ''}">
            <input type="radio" name="lense-type" value="${this.escapeHtml(lens.id)}" ${selected ? 'checked' : ''}>
            <span class="lense-option__media">${image}</span>
            <span class="lense-option__content">
              <span class="lense-option__title">${this.escapeHtml(lens.title)}</span>
            </span>
            <span class="lense-option__check" aria-hidden="true"></span>
          </label>
        `;
      })
      .join('');

    return `
      <div class="lense-step lense-step--types">
        <p class="lense-step__intro">Choose the contact lens type that matches your prescription.</p>
        <div class="lense-option-list" role="radiogroup" aria-label="Contact lens type">
          ${options || '<p class="lense-empty">No lens types configured for this product.</p>'}
        </div>
      </div>
    `;
  }

  bindStep1() {
    this.body.querySelectorAll('input[name="lense-type"]').forEach((input) => {
      input.addEventListener('change', () => {
        this.state.lensTypeId = input.value;
        this.state.prescription = { od: {}, os: {}, shared: {} };
        this.body.querySelectorAll('.lense-option').forEach((el) => el.classList.remove('is-selected'));
        input.closest('.lense-option')?.classList.add('is-selected');
        this.updateChrome();
      });
    });
  }

  renderStep2() {
    const methods = CustomLensePopup.METHODS.map((method) => {
      const disabled = method.requiresLogin && !this.config.customerLoggedIn;
      const selected = this.state.method === method.id;
      return `
        <label class="lense-option lense-option--method ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}">
          <input type="radio" name="lense-method" value="${method.id}" ${selected ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
          <span class="lense-option__content">
            <span class="lense-option__title">${this.escapeHtml(method.title)}</span>
            <span class="lense-option__desc">
              ${this.escapeHtml(method.description)}
              ${disabled ? ' (Log in required)' : ''}
            </span>
          </span>
          <span class="lense-option__check" aria-hidden="true"></span>
        </label>
      `;
    }).join('');

    const uploadSection =
      this.state.method === 'upload'
        ? `
      <div class="lense-upload">
        <label class="lense-upload__label button button--secondary" for="LenseUpload-${this.root.dataset.blockId}">
          Choose file
        </label>
        <input id="LenseUpload-${this.root.dataset.blockId}" class="lense-upload__input" type="file" accept="image/*,.pdf,application/pdf">
        <p class="lense-upload__name" data-upload-name>
          ${this.state.uploadFileName ? this.escapeHtml(this.state.uploadFileName) : 'No file selected'}
        </p>
      </div>
    `
        : '';

    return `
      <div class="lense-step lense-step--method">
        <p class="lense-step__intro">How would you like to provide your prescription?</p>
        <div class="lense-option-list" role="radiogroup" aria-label="Prescription method">
          ${methods}
        </div>
        ${uploadSection}
      </div>
    `;
  }

  bindStep2() {
    this.body.querySelectorAll('input[name="lense-method"]').forEach((input) => {
      input.addEventListener('change', () => {
        this.state.method = input.value;
        if (this.state.method !== 'upload') this.state.uploadFileName = '';
        this.renderStep();
      });
    });

    const fileInput = this.body.querySelector('.lense-upload__input');
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      this.state.uploadFileName = file ? file.name : '';
      const nameEl = this.body.querySelector('[data-upload-name]');
      if (nameEl) nameEl.textContent = this.state.uploadFileName || 'No file selected';
      this.updateChrome();
    });
  }

  renderSelect(field, eye, currentValue, { hideLabel = false, labelOverride = null } = {}) {
    const name = eye ? `${eye}-${field.key}` : `shared-${field.key}`;
    const label = labelOverride || field.label;
    const options = field.values
      .map((value) => {
        const selected = String(currentValue) === String(value) ? 'selected' : '';
        return `<option value="${this.escapeHtml(value)}" ${selected}>${this.escapeHtml(value)}</option>`;
      })
      .join('');

    return `
      <label class="lense-field${hideLabel ? ' lense-field--no-label' : ''}">
        <span class="lense-field__label">${this.escapeHtml(label)}</span>
        <select class="lense-field__select" name="${this.escapeHtml(name)}" data-field-key="${this.escapeHtml(field.key)}" data-eye="${eye || 'shared'}" required>
          <option value="">Select</option>
          ${options}
        </select>
      </label>
    `;
  }

  renderPrescriptionFields(lens, { intro = '' } = {}) {
    if (!lens) {
      return `<p class="lense-empty">Unable to load power configuration for the selected lens type.</p>`;
    }

    const eyeFields = lens.fields.filter((f) => f.scope === 'eye');
    const sharedFields = lens.fields.filter((f) => f.scope === 'shared');

    if (!eyeFields.length && !sharedFields.length) {
      return `<p class="lense-empty">No prescription fields are configured in the Power Configuration metaobject for this lens type.</p>`;
    }

    const eyeTable =
      eyeFields.length > 0
        ? `
      <div class="lense-rx-grid">
        <div class="lense-rx-grid__head">
          <span></span>
          <span>Right Eye (OD)</span>
          <span>Left Eye (OS)</span>
        </div>
        ${eyeFields
          .map(
            (field) => `
          <div class="lense-rx-grid__row">
            <span class="lense-rx-grid__key">${this.escapeHtml(field.label)}</span>
            <div class="lense-rx-grid__cell" data-mobile-label="Right (OD) ${this.escapeHtml(field.label)}">
              ${this.renderSelect(field, 'od', this.state.prescription.od[field.key], { hideLabel: true })}
            </div>
            <div class="lense-rx-grid__cell" data-mobile-label="Left (OS) ${this.escapeHtml(field.label)}">
              ${this.renderSelect(field, 'os', this.state.prescription.os[field.key], { hideLabel: true })}
            </div>
          </div>
        `
          )
          .join('')}
      </div>
      <label class="lense-same-as">
        <input type="checkbox" data-same-as-right ${this.state.sameAsRight ? 'checked' : ''}>
        <span>Left eye same as right eye</span>
      </label>
    `
        : '';

    const sharedBlock =
      sharedFields.length > 0
        ? `
      <div class="lense-shared-fields">
        <h3 class="lense-shared-fields__title">Lens details</h3>
        <div class="lense-shared-fields__grid">
          ${sharedFields
            .map((field) => this.renderSelect(field, null, this.state.prescription.shared[field.key]))
            .join('')}
        </div>
      </div>
    `
        : '';

    return `
      ${intro ? `<p class="lense-step__intro">${intro}</p>` : ''}
      ${eyeTable}
      ${sharedBlock}
    `;
  }

  bindPrescriptionFields() {
    this.body.querySelectorAll('select[data-field-key]').forEach((select) => {
      select.addEventListener('change', () => {
        const key = select.dataset.fieldKey;
        const eye = select.dataset.eye;
        if (eye === 'shared') {
          this.state.prescription.shared[key] = select.value;
        } else {
          this.state.prescription[eye][key] = select.value;
          if (eye === 'od' && this.state.sameAsRight) {
            this.copyRightToLeft();
            this.renderStep();
            return;
          }
        }
        this.updateChrome();
      });
    });

    const sameAs = this.body.querySelector('[data-same-as-right]');
    sameAs?.addEventListener('change', () => {
      this.state.sameAsRight = sameAs.checked;
      if (this.state.sameAsRight) {
        this.copyRightToLeft();
        this.renderStep();
      }
    });
  }

  renderStep3() {
    const lens = this.getSelectedLens();
    return `
      <div class="lense-step lense-step--rx">
        ${this.renderPrescriptionFields(lens, {
          intro: `Enter values for <strong>${this.escapeHtml(lens?.title || '')}</strong>. Options are loaded from the Power Configuration metaobject.`,
        })}
      </div>
    `;
  }

  bindStep3() {
    this.bindPrescriptionFields();
  }

  copyRightToLeft() {
    const lens = this.getSelectedLens();
    if (!lens) return;
    lens.fields
      .filter((f) => f.scope === 'eye')
      .forEach((field) => {
        this.state.prescription.os[field.key] = this.state.prescription.od[field.key] || '';
      });
  }

  renderStep4() {
    const lens = this.getSelectedLens();
    const method = CustomLensePopup.METHODS.find((m) => m.id === this.state.method);
    const showPrescriptionFields = this.state.method !== 'upload';

    const methodExtra =
      this.state.method === 'upload'
        ? `<li><span>Uploaded file</span><strong>${this.escapeHtml(this.state.uploadFileName || '—')}</strong></li>`
        : '';

    return `
      <div class="lense-step lense-step--review">
        <div class="lense-review">
          <div class="lense-review__block">
            <h3>Lens Type</h3>
            <p>${this.escapeHtml(lens?.title || '—')}</p>
          </div>
          <div class="lense-review__block">
            <h3>Prescription Method</h3>
            <p>${this.escapeHtml(method?.title || '—')}</p>
            ${methodExtra ? `<ul class="lense-review__list">${methodExtra}</ul>` : ''}
          </div>

          ${
            showPrescriptionFields
              ? `
            <div class="lense-review__prescription">
              <h3 class="lense-review__prescription-title">Prescription details</h3>
              ${this.renderPrescriptionFields(lens, {
                intro:
                  'All SPH, CYL, AXIS, ADD, Base Curve, Diameter and Day/Night options below are populated from the Power Configuration metaobject for the selected lens type.',
              })}
            </div>
          `
              : ''
          }

          <div class="lense-review__qty">
            <label class="lense-field">
              <span class="lense-field__label">Quantity</span>
              <input class="lense-field__input" type="number" min="1" step="1" value="${this.escapeHtml(this.state.quantity)}" data-lense-qty>
            </label>
          </div>
        </div>
      </div>
    `;
  }

  bindStep4() {
    this.bindPrescriptionFields();

    const qtyInput = this.body.querySelector('[data-lense-qty]');
    qtyInput?.addEventListener('change', () => {
      this.state.quantity = Math.max(1, parseInt(qtyInput.value, 10) || 1);
      qtyInput.value = this.state.quantity;
    });
    qtyInput?.addEventListener('input', () => {
      this.state.quantity = Math.max(1, parseInt(qtyInput.value, 10) || 1);
    });
  }

  buildLineItemProperties() {
    const lens = this.getSelectedLens();
    const properties = {
      'Lens Type': lens?.title || '',
      'Prescription Method':
        CustomLensePopup.METHODS.find((m) => m.id === this.state.method)?.title || this.state.method,
    };

    if (this.state.method === 'upload') {
      properties['Prescription File'] = this.state.uploadFileName || '';
      return properties;
    }

    (lens?.fields || []).forEach((field) => {
      if (field.scope === 'shared') {
        const value = this.state.prescription.shared[field.key];
        if (value) properties[field.label] = value;
        return;
      }

      const od = this.state.prescription.od[field.key];
      const os = this.state.prescription.os[field.key];
      if (od) properties[`OD ${field.label}`] = od;
      if (os) properties[`OS ${field.label}`] = os;
    });

    return properties;
  }

  async addToCart() {
    if (!this.validateStep()) return;

    const variantId = this.getVariantId();
    if (!variantId) {
      this.showError('No product variant selected.');
      return;
    }

    this.continueBtn.disabled = true;
    this.continueBtn.classList.add('loading');
    this.clearError();

    const properties = this.buildLineItemProperties();
    const formData = new FormData();
    formData.append('id', variantId);
    formData.append('quantity', String(this.state.quantity || 1));

    Object.entries(properties).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).length) {
        formData.append(`properties[${key}]`, String(value));
      }
    });

    const cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
    if (cart?.getSectionsToRender) {
      formData.append(
        'sections',
        cart.getSectionsToRender().map((section) => section.id)
      );
      formData.append('sections_url', window.location.pathname);
      cart.setActiveElement?.(this.openBtn);
    }

    const config = typeof fetchConfig === 'function' ? fetchConfig('javascript') : {
      method: 'POST',
      headers: { Accept: 'application/javascript', 'X-Requested-With': 'XMLHttpRequest' },
    };
    config.headers = config.headers || {};
    config.headers['X-Requested-With'] = 'XMLHttpRequest';
    delete config.headers['Content-Type'];
    config.body = formData;

    try {
      const response = await fetch(this.config.cartAddUrl || routes.cart_add_url, config);
      const data = await response.json();

      if (data.status) {
        this.showError(data.description || data.message || 'Unable to add to cart.');
        this.continueBtn.disabled = false;
        this.continueBtn.classList.remove('loading');
        return;
      }

      this.close();

      if (!cart) {
        window.location = this.config.cartUrl || window.routes?.cart_url || '/cart';
        return;
      }

      if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
        publish(PUB_SUB_EVENTS.cartUpdate, {
          source: 'custom-lense',
          productVariantId: variantId,
          cartData: data,
        });
      }

      cart.renderContents?.(data);
      cart.classList?.remove('is-empty');
    } catch (error) {
      console.error(error);
      this.showError('Something went wrong while adding to cart. Please try again.');
      this.continueBtn.disabled = false;
      this.continueBtn.classList.remove('loading');
    }
  }
}

function initCustomLensePopups() {
  document.querySelectorAll('[data-custom-lense]').forEach((root) => {
    if (root.dataset.lenseReady === 'true') return;
    root.dataset.lenseReady = 'true';
    new CustomLensePopup(root);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCustomLensePopups);
} else {
  initCustomLensePopups();
}

document.addEventListener('shopify:section:load', initCustomLensePopups);

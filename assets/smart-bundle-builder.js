class SmartBundleBuilder extends HTMLElement {
  constructor() {
    super();
    this.state = {
      products: [],
      selected: new Map(),
      selectionsByProduct: new Map(),
      uiReady: false,
      addState: 'idle',
    };
  }

  connectedCallback() {
    const dataEl = this.querySelector('[data-products]');
    if (!dataEl) return;

    try {
      this.state.products = JSON.parse(dataEl.textContent || '[]');
    } catch (e) {
      console.error(e);
      this.state.products = [];
    }

    const cap = this._readDataInt('data-bundle-capacity', NaN);
    const co = this._readDataInt('data-bundle-checkout', NaN);
    if (Number.isFinite(cap) && Number.isFinite(co)) {
      this.bundleCapacity = cap;
      this.bundleCheckoutSize = co;
    } else {
      const legacy = this._readDataInt('data-bundle-size', 4);
      this.bundleCapacity = legacy;
      this.bundleCheckoutSize = legacy;
    }
    
    this.discounts = {
      2: this._readDataInt('data-discount-2', 0),
      3: this._readDataInt('data-discount-3', 0),
      4: this._readDataInt('data-discount-4', 0),
    };
    this.redirectToCart = this.dataset.redirectToCart === 'true';
    this.currency = this.dataset.currency || (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'USD';
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.summaryEl = this.querySelector('[data-summary]');
    this.itemsEl = this.querySelector('[data-items]');
    this.subtotalEl = this.querySelector('[data-subtotal]');
    this.discountRowEl = this.querySelector('[data-discount-row]');
    this.discountEl = this.querySelector('[data-discount]');
    this.totalEl = this.querySelector('[data-total]');
    this.savingsRowEl = this.querySelector('[data-savings-row]');
    this.savingsEl = this.querySelector('[data-savings]');
    this.srLiveEl = this.querySelector('[data-sr-live]');
    this.errorEl = this.querySelector('[data-error]');
    this.addBtn = this.querySelector('[data-add-bundle]');
    this.addBtnLabel = this.querySelector('[data-add-bundle-label]');
    this.addBtnIcon = this.querySelector('[data-add-bundle-icon]');
    this.addBtnSpinner = this.querySelector('.smart-bundle__spinner');

    this._ensureSummaryTemplate();
    this._initCards();
    this._bindSummaryControls();
    this._updateSummaryUI({ announce: false });
    this.state.uiReady = true;
  }

  _readDataInt(attrName, fallback) {
    const raw = this.getAttribute(attrName);
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  _ensureSummaryTemplate() {
    if (this.querySelector('template[data-summary-item-template]')) return;
    const tpl = document.createElement('template');
    tpl.setAttribute('data-summary-item-template', '');
    const fallback = `
      <div class="smart-bundle__summary-item" role="listitem">
        <div class="smart-bundle__summary-thumb" data-thumb></div>
        <div class="smart-bundle__summary-meta">
          <p class="smart-bundle__summary-name" data-title></p>
          <p class="smart-bundle__summary-variant" data-variant></p>
          <p class="smart-bundle__summary-price" data-line-price></p>
        </div>
        <div class="smart-bundle__summary-controls">
          <button type="button" class="smart-bundle__icon-btn" data-decrement aria-label="Decrease quantity">-</button>
          <span class="smart-bundle__qty" aria-label="Quantity" data-qty>1</span>
          <button type="button" class="smart-bundle__icon-btn" data-increment aria-label="Increase quantity">+</button>
          <button type="button" class="smart-bundle__icon-btn smart-bundle__icon-btn--remove" data-remove aria-label="Remove item">×</button>
        </div>
      </div>
    `;
    tpl.innerHTML = fallback;
    this.appendChild(tpl);
  }

  _initCards() {
    const cards = this.querySelectorAll('[data-product-id]');
    cards.forEach((card) => {
      const productId = parseInt(card.dataset.productId, 10);
      const product = this.state.products.find((p) => p.id === productId);
      if (!product) return;

      const btnAdd = card.querySelector('[data-add-to-bundle]');
      const btnRemove = card.querySelector('[data-remove-from-bundle]');
      const badge = card.querySelector('[data-sold-out-badge]');

      const initialVariant = this._getFirstAvailableVariant(product) || product.variants[0];
      const names = product.options || [];
      const initialValues = names.map((_, i) => initialVariant?.options?.[i] ?? null);

      this.state.selectionsByProduct.set(productId, {
        values: initialValues,
        variantId: initialVariant?.id,
      });

      this._renderOptionPickers(product, card);

      btnAdd?.addEventListener('click', () => this._onAddClick(productId));
      btnRemove?.addEventListener('click', () => this._onRemoveProductClick(productId));

      this._refreshCardVariantState(productId);

      if (badge) {
        const anyAvailable = product.variants.some((v) => v.available);
        badge.hidden = anyAvailable;
      }
    });
  }

  _getFirstAvailableVariant(product) {
    return product.variants.find((v) => v.available) || null;
  }

  _optionValuesForIndex(product, optionIndex) {
    const values = new Set();
    for (const v of product.variants) {
      const val = v.options[optionIndex];
      if (val != null && String(val).trim() !== '') values.add(val);
    }
    return Array.from(values);
  }

  _renderOptionPickers(product, card) {
    const root = card.querySelector('[data-option-pickers]');
    if (!root) return;
    root.innerHTML = '';

    const names = product.options || [];
    if (!names.length) return;

    const stored = this.state.selectionsByProduct.get(product.id) || {};
    let values = names.map((_, i) => stored.values?.[i] ?? null);

    names.forEach((optionName, optionIndex) => {
      const choices = this._optionValuesForIndex(product, optionIndex);
      if (!choices.length) return;
      if (!values[optionIndex] || !choices.includes(values[optionIndex])) {
        values[optionIndex] = choices[0];
      }
    });

    this.state.selectionsByProduct.set(product.id, {
      ...stored,
      values,
      variantId: stored.variantId,
    });

    names.forEach((optionName, optionIndex) => {
      const choices = this._optionValuesForIndex(product, optionIndex);
      if (!choices.length) return;
      
      if (choices.length <= 1) return;

      const current = values[optionIndex];
      const baseId = `sb-opt-${product.id}-${optionIndex}`;

      const section = document.createElement('div');
      section.className = 'smart-bundle__option smart-bundle__option--dropdown';
      section.dataset.optionIndex = String(optionIndex);

      const lab = document.createElement('label');
      lab.className = 'smart-bundle__option-label';
      lab.setAttribute('for', baseId);
      const nameSpan = document.createElement('span');
      nameSpan.className = 'smart-bundle__option-name';
      nameSpan.textContent = optionName;
      lab.appendChild(nameSpan);

      const selectWrap = document.createElement('div');
      selectWrap.className = 'select';
      const sel = document.createElement('select');
      sel.id = baseId;
      sel.className = 'select__select';
      sel.setAttribute('aria-label', `${optionName}`);

      choices.forEach((value) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        if (value === current) opt.selected = true;
        sel.appendChild(opt);
      });

      sel.addEventListener('change', (e) => {
        const s = this.state.selectionsByProduct.get(product.id) || {};
        const vals = names.map((_, i) => s.values?.[i] ?? values[i]);
        vals[optionIndex] = e.target.value;
        this.state.selectionsByProduct.set(product.id, { ...s, values: vals });
        this._refreshCardVariantState(product.id);
      });

      selectWrap.appendChild(sel);
      const caret = document.createElement('span');
      caret.className = 'svg-wrapper';
      caret.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" class="icon icon-caret" viewBox="0 0 10 6"><path fill="currentColor" fill-rule="evenodd" d="m1 .75 4 4 4-4 1 1-5 5-5-5z" clip-rule="evenodd"/></svg>';
      selectWrap.appendChild(caret);

      section.appendChild(lab);
      section.appendChild(selectWrap);
      root.appendChild(section);
    });
  }

  _matchVariant(productId) {
    const product = this.state.products.find((p) => p.id === productId);
    if (!product) return null;

    const sel = this.state.selectionsByProduct.get(productId);
    const values = sel?.values;
    const names = product.options || [];

    if (!values || values.length !== names.length) {
      return this._getFirstAvailableVariant(product) || product.variants[0] || null;
    }

    const matches = product.variants.filter((v) =>
      names.every((_, idx) => {
        const want = values[idx];
        if (want == null || want === '') return true;
        return v.options[idx] === want;
      })
    );

    return matches.find((v) => v.available) || matches[0] || product.variants[0] || null;
  }

  _updateCardDisplayedPrice(card, variant) {
    const wrap = card.querySelector('[data-card-price-wrap]');
    if (!wrap || variant == null) return;
    wrap.dataset.priceCents = String(variant.price);
    wrap.replaceChildren();
    const priceRoot = document.createElement('div');
    priceRoot.className = 'price';
    const container = document.createElement('div');
    container.className = 'price__container';
    const regular = document.createElement('div');
    regular.className = 'price__regular';
    const span = document.createElement('span');
    span.className = 'price-item price-item--regular';
    span.textContent = this._formatMoney(variant.price);
    regular.appendChild(span);
    container.appendChild(regular);
    priceRoot.appendChild(container);
    wrap.appendChild(priceRoot);
  }

  _refreshCardVariantState(productId) {
    const product = this.state.products.find((p) => p.id === productId);
    const card = this.querySelector(`[data-product-id="${productId}"]`);
    if (!product || !card) return;

    const variant = this._matchVariant(productId);
    const currentSel = this.state.selectionsByProduct.get(productId) || {};
    this.state.selectionsByProduct.set(productId, { ...currentSel, variantId: variant?.id });

    this._updateCardDisplayedPrice(card, variant);

    const btnAdd = card.querySelector('[data-add-to-bundle]');
    const addLabel = card.querySelector('[data-add-label]');
    const btnRemove = card.querySelector('[data-remove-from-bundle]');
    const soldBadge = card.querySelector('[data-sold-out-badge]');

    const isVariantAvailable = !!variant?.available;
    const displayedVariantId = variant?.id;
    const lineForDisplayedVariant =
      displayedVariantId != null ? this.state.selected.get(String(displayedVariantId)) : null;
    const thisVariantInBundle =
      !!lineForDisplayedVariant && Number(lineForDisplayedVariant.productId) === Number(productId);
    const isFull =
      this._selectedUnitsCount() >= this.bundleCapacity &&
      !lineForDisplayedVariant;

    if (btnAdd) {
      btnAdd.hidden = thisVariantInBundle;
      btnAdd.disabled = thisVariantInBundle || !isVariantAvailable || isFull;
      btnAdd.setAttribute('aria-disabled', btnAdd.disabled ? 'true' : 'false');
    }

    if (addLabel) {
      if (!isVariantAvailable) addLabel.textContent = 'Sold out';
      else if (isFull) addLabel.textContent = 'Bundle full';
      else addLabel.textContent = 'Add to bundle';
    }

    if (soldBadge) soldBadge.hidden = isVariantAvailable;
    if (btnRemove) btnRemove.hidden = !thisVariantInBundle;

    this._updateSummaryUI({ announce: false });
  }

  _selectedUnitsCount() {
    let count = 0;
    for (const item of this.state.selected.values()) count += item.qty;
    return count;
  }

  _onAddClick(productId) {
    const product = this.state.products.find((p) => p.id === productId);
    const variant = this._matchVariant(productId);
    if (!product || !variant) return;

    if (!variant.available) {
      this._announce(`${product.title} is sold out.`);
      this._refreshCardVariantState(productId);
      return;
    }

    const newVariantId = variant.id;
    const newKey = String(newVariantId);
    const currentForNewVariant = this.state.selected.get(newKey);

    if (this._selectedUnitsCount() >= this.bundleCapacity && !currentForNewVariant) {
      this._announce(`Bundle is full. Remove an item to add another.`);
      return;
    }

    const curQty = currentForNewVariant?.qty || 0;
    const otherUnits = this._selectedUnitsCount() - curQty;
    const nextQty = Math.min(curQty + 1, Math.max(1, this.bundleCapacity - otherUnits));

    const variantTitle = this._variantTitleFor(product, variant);
    const image = product.image;

    this.state.selected.set(newKey, {
      productId,
      variantId: newVariantId,
      qty: nextQty,
      title: product.title,
      variantTitle,
      price: variant.price,
      image,
    });

    this._updateSummaryUI({ announce: true, message: `Added ${product.title} to bundle.` });
    this._refreshAllCards();
  }

  _variantTitleFor(product, variant) {
    if (!variant || !product) return '';
    const opts = Array.isArray(variant.options) ? variant.options : [];
    if (opts.length <= 1) return opts[0] || '';
    return opts.filter(Boolean).join(' / ');
  }

  _onRemoveProductClick(productId) {
    const variant = this._matchVariant(productId);
    if (!variant?.id) return;
    const item = this.state.selected.get(String(variant.id));
    if (!item || Number(item.productId) !== Number(productId)) return;
    this._removeVariant(variant.id);
  }

  _removeVariant(variantId, { silent = false } = {}) {
    const key = String(variantId);
    const item = this.state.selected.get(key);
    if (!item) return;
    this.state.selected.delete(key);
    this._updateSummaryUI({ announce: !silent, message: `Removed ${item.title} from bundle.` });
    this._refreshAllCards();
  }

  _refreshAllCards() {
    const cards = this.querySelectorAll('[data-product-id]');
    cards.forEach((card) => this._refreshCardVariantState(parseInt(card.dataset.productId, 10)));
  }

  _bindSummaryControls() {
    if (!this.addBtn) return;
    this.addBtn.addEventListener('click', () => this._addBundleToCart());
  }

  _renderSummaryItems() {
    if (!this.itemsEl) return;
    const tpl = this.querySelector('template[data-summary-item-template]');
    const fragment = document.createDocumentFragment();

    this.itemsEl.innerHTML = '';

    for (const item of this.state.selected.values()) {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.variantId = String(item.variantId);

      const thumb = node.querySelector('[data-thumb]');
      if (thumb && item.image) {
        thumb.innerHTML = `<img src="${this._escapeAttr(item.image)}" alt="" loading="lazy" width="48" height="48">`;
      }

      const title = node.querySelector('[data-title]');
      const variant = node.querySelector('[data-variant]');
      const line = node.querySelector('[data-line-price]');
      const qty = node.querySelector('[data-qty]');

      if (title) title.textContent = item.title;
      if (variant) variant.textContent = item.variantTitle || '';
      if (line) line.textContent = this._formatMoney(item.price * item.qty);
      if (qty) qty.textContent = String(item.qty);

      const dec = node.querySelector('[data-decrement]');
      const inc = node.querySelector('[data-increment]');
      const rem = node.querySelector('[data-remove]');

      dec?.addEventListener('click', () => this._changeQty(item.variantId, -1));
      inc?.addEventListener('click', () => this._changeQty(item.variantId, +1));
      rem?.addEventListener('click', () => this._removeVariant(item.variantId));

      fragment.appendChild(node);
    }

    this.itemsEl.appendChild(fragment);
  }

  _changeQty(variantId, delta) {
    const key = String(variantId);
    const item = this.state.selected.get(key);
    if (!item) return;

    const next = item.qty + delta;
    if (next <= 0) {
      this._removeVariant(variantId);
      return;
    }

    const maxAllowed = this.bundleCapacity;
    const otherUnits = this._selectedUnitsCount() - item.qty;
    const capped = Math.min(next, Math.max(1, maxAllowed - otherUnits));

    item.qty = capped;
    this.state.selected.set(key, item);

    this._bumpQtyUI(variantId);
    this._updateSummaryUI({ announce: true, message: `Updated quantity for ${item.title}.` });
    this._refreshAllCards();
  }

  _bumpQtyUI(variantId) {
    if (this.reducedMotion) return;
    const row = this.itemsEl?.querySelector(`[data-variant-id="${variantId}"]`);
    const qty = row?.querySelector('[data-qty]');
    if (!qty) return;
    qty.classList.remove('is-bump');
    // Force reflow
    void qty.offsetWidth;
    qty.classList.add('is-bump');
    window.setTimeout(() => qty.classList.remove('is-bump'), 180);
  }

  _discountPercentFor(count) {
    if (count >= 4) return this.discounts[4] || 0;
    if (count === 3) return this.discounts[3] || 0;
    if (count === 2) return this.discounts[2] || 0;
    return 0;
  }

  _computeTotals() {
    const units = this._selectedUnitsCount();
    let subtotal = 0;
    for (const item of this.state.selected.values()) subtotal += item.price * item.qty;

    const pct = this._discountPercentFor(units);
    const discount = Math.round((subtotal * pct) / 100);
    const total = subtotal - discount;
    return { units, subtotal, pct, discount, total };
  }

  _updateSummaryUI({ announce = false, message = '' } = {}) {
    if (!this.summaryEl) return;

    const hasAny = this.state.selected.size > 0;
    this.summaryEl.hidden = !hasAny;
    if (hasAny) this.summaryEl.classList.add('is-visible');
    else this.summaryEl.classList.remove('is-visible');

    if (hasAny) this._renderSummaryItems();

    const totals = this._computeTotals();

    if (this.subtotalEl) this.subtotalEl.textContent = this._formatMoney(totals.subtotal);
    if (this.totalEl) this.totalEl.textContent = this._formatMoney(totals.total);

    const showDiscount = totals.discount > 0;
    if (this.discountRowEl) this.discountRowEl.hidden = !showDiscount;
    if (this.discountEl) this.discountEl.textContent = `- ${this._formatMoney(totals.discount)} (${totals.pct}%)`;

    if (this.savingsRowEl) this.savingsRowEl.hidden = !showDiscount;
    if (this.savingsEl) this.savingsEl.textContent = `You save ${this._formatMoney(totals.discount)}.`;

    const canAdd =
      hasAny &&
      this.state.addState !== 'loading' &&
      totals.units >= this.bundleCheckoutSize &&
      totals.units <= this.bundleCapacity;
    if (this.addBtn) this.addBtn.disabled = !canAdd;

    if (announce && (message || this.srLiveEl)) {
      const text = message || `Bundle total is ${this._formatMoney(totals.total)} after discount.`;
      this._announce(text);
    }
  }

  _announce(text) {
    if (!this.srLiveEl) return;
    // Reset to ensure screen readers re-announce
    this.srLiveEl.textContent = '';
    window.setTimeout(() => {
      this.srLiveEl.textContent = text;
    }, 20);
  }

  _formatMoney(cents) {
    const value = (Number(cents) || 0) / 100;
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: this.currency }).format(value);
    } catch (e) {
      return `${value.toFixed(2)} ${this.currency}`;
    }
  }

  _escapeAttr(str) {
    return String(str || '').replace(/"/g, '&quot;');
  }

  async _addBundleToCart() {
    const totals = this._computeTotals();
    if (totals.units < this.bundleCheckoutSize || totals.units > this.bundleCapacity) return;

    this._setAddState('loading');
    this._setError('');

    const items = [];
    for (const item of this.state.selected.values()) {
      items.push({ id: item.variantId, quantity: item.qty });
    }

    try {
      const res = await fetch(`${window.Shopify?.routes?.root || '/'}cart/add.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.description || err?.message || 'Could not add bundle to cart.');
      }

      await res.json().catch(() => ({}));
      this._setAddState('success');
      this._announce('Bundle added to cart.');

      if (this.redirectToCart) {
        window.location.assign(`${window.Shopify?.routes?.root || '/'}cart`);
        return;
      }

      window.setTimeout(() => {
        this._setAddState('idle');
      }, 2000);
    } catch (e) {
      this._setAddState('error');
      this._setError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      this._updateSummaryUI({ announce: false });
    }
  }

  _setError(message) {
    if (!this.errorEl) return;
    const msg = String(message || '');
    this.errorEl.hidden = msg.length === 0;
    this.errorEl.textContent = msg;
  }

  _setAddState(state) {
    this.state.addState = state;
    if (!this.addBtn) return;

    const icon = this.addBtnIcon;
    const label = this.addBtnLabel;
    const spinner = this.addBtnSpinner;

    if (spinner) spinner.classList.toggle('hidden', state !== 'loading');
    if (label) {
      if (state === 'loading') label.textContent = 'Adding…';
      else if (state === 'success') label.textContent = 'Added';
      else if (state === 'error') label.textContent = 'Retry add to cart';
      else label.textContent = 'Add bundle to cart';
    }

    if (icon) {
      icon.innerHTML = '';
      if (state === 'success') {
        icon.innerHTML =
          '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.5 5.5L8.5 13.5L3.5 8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      } else if (state === 'error') {
        icon.innerHTML =
          '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 6v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 14.5h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M10 19a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" stroke-width="1.5"/></svg>';
      }
    }
  }
}

if (!customElements.get('smart-bundle-builder')) {
  customElements.define('smart-bundle-builder', SmartBundleBuilder);
}


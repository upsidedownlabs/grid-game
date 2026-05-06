"use client";
import React, { useEffect, useRef, useState } from 'react';
import Link from "next/link";

const NeuroArtConfigurator: React.FC = () => {
  // Add state for validation
  const [actionConflict, setActionConflict] = useState<string | null>(null);
  
  // Refs to access BLE state across the component
  const configCharacteristicRef = useRef<any>(null);
  const isConnectedRef = useRef(false);

  useEffect(() => {
    // BLE UUIDs
    const SERVICE_UUID = "6910123a-eb0d-4c35-9a60-bebe1dcb549d";
    const CONFIG_CHAR_UUID = "6f4f1107-7fc1-43b2-a540-0aa1a9f1ce79";
    const DATA_CHAR_UUID = "7f4f1107-7fc1-43b2-a540-0aa1a9f1ce80";

    let bleDevice: any = null;
    let dataCharacteristic: any = null;
    let configCharacteristic: any = null;
    let isConnected = false;
    let isConfigMode = false;
    let autoSaveTimer: any = null;
    let isUpdatingFromServer = false;

    // Update refs when values change
    configCharacteristicRef.current = configCharacteristic;
    isConnectedRef.current = isConnected;

    // DOM Elements
    const blinkSlider = document.getElementById('blinkSlider') as HTMLInputElement;
    const jawOnSlider = document.getElementById('jawOnSlider') as HTMLInputElement;
    const emgLeftSlider = document.getElementById('emgLeftSlider') as HTMLInputElement;
    const emgRightSlider = document.getElementById('emgRightSlider') as HTMLInputElement;
    
    // Action dropdown elements
    const blinkActionSelect = document.getElementById('blinkAction') as HTMLSelectElement;
    const leftEMGActionSelect = document.getElementById('leftEMGAction') as HTMLSelectElement;
    const rightEMGActionSelect = document.getElementById('rightEMGAction') as HTMLSelectElement;
    const jawReleaseActionSelect = document.getElementById('jawReleaseAction') as HTMLSelectElement;
    const jawHoldActionSelect = document.getElementById('jawHoldAction') as HTMLSelectElement;

    // Current thresholds cache
    let currentThresholds = {
      blink: 50,
      jawOn: 40,
      emgLeft: 150,
      emgRight: 150,
      blinkAction: 3,
      leftEMGAction: 9,
      rightEMGAction: 8,
      jawReleaseAction: 2,
      jawHoldAction: 0
    };

    // Helper: Check for duplicate actions
    function checkForDuplicateActions(): string | null {
      const blinkAction = parseInt(blinkActionSelect.value);
      const leftEMGAction = parseInt(leftEMGActionSelect.value);
      const rightEMGAction = parseInt(rightEMGActionSelect.value);
      const jawReleaseAction = parseInt(jawReleaseActionSelect.value);
      const jawHoldAction = parseInt(jawHoldActionSelect.value);
      
      const actions = [
        { name: 'Triple Blink', value: blinkAction },
        { name: 'Left EMG', value: leftEMGAction },
        { name: 'Right EMG', value: rightEMGAction },
        { name: 'Jaw Release', value: jawReleaseAction },
        { name: 'Jaw Hold', value: jawHoldAction }
      ];
      
      // Skip NO ACTION (value 0) in duplicate check
      const activeActions = actions.filter(a => a.value !== 0);
      
      // Find duplicates among active actions only
      for (let i = 0; i < activeActions.length; i++) {
        for (let j = i + 1; j < activeActions.length; j++) {
          if (activeActions[i].value === activeActions[j].value) {
            return `${activeActions[i].name} and ${activeActions[j].name} have the same action!`;
          }
        }
      }
      return null;
    }

    // Helper: Update threshold thumb position
    function updateThresholdFromSlider(slider: HTMLInputElement, thumbId: string, badgeId: string, displayId: string, suffix = '') {
      const thumb = document.getElementById(thumbId);
      const badge = document.getElementById(badgeId);
      if (!thumb || !badge) return;
      const min = parseFloat(slider.min);
      const max = parseFloat(slider.max);
      const value = parseFloat(slider.value);
      let percent = (value - min) / (max - min) * 100;
      percent = Math.min(100, Math.max(0, percent));
      (thumb as HTMLElement).style.left = percent + '%';
      let displayValue = (suffix === '%' ? value.toFixed(1) : Math.round(value)) + suffix;
      badge.innerHTML = displayValue;
      const containerWidth = (slider.parentElement as HTMLElement).offsetWidth;
      const badgeWidth = badge.offsetWidth;
      let leftPx = (percent / 100) * containerWidth;
      leftPx = Math.min(containerWidth - badgeWidth / 2, Math.max(badgeWidth / 2, leftPx));
      (badge as HTMLElement).style.left = leftPx + 'px';
      if (displayId) {
        const display = document.getElementById(displayId);
        if (display) display.textContent = suffix === '%' ? value.toFixed(1) : Math.round(value).toString();
      }
    }

    // Helper: Update live fill display
    function updateLiveDisplay(fillId: string, labelId: string, liveValue: number, min: number, max: number, suffix = '') {
      const fill = document.getElementById(fillId);
      const label = document.getElementById(labelId);
      if (!fill || !label) return;
      let percent = (liveValue - min) / (max - min) * 100;
      percent = Math.min(100, Math.max(0, percent));
      (fill as HTMLElement).style.width = percent + '%';
      label.innerHTML = (suffix === '%' ? liveValue.toFixed(1) : Math.round(liveValue)) + suffix;
    }

    // Setup slider drag
    function setupSliderDrag(slider: HTMLInputElement, thumbId: string, badgeId: string, displayId: string, suffix = '') {
      slider.addEventListener('input', () => {
        if (!isUpdatingFromServer) {
          updateThresholdFromSlider(slider, thumbId, badgeId, displayId, suffix);
          autoSave();
        }
      });
      const thumb = document.getElementById(thumbId);
      if (thumb) {
        thumb.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const container = slider.parentElement;
          const rect = container!.getBoundingClientRect();
          const onMove = (moveEvent: MouseEvent) => {
            let x = moveEvent.clientX - rect.left;
            x = Math.max(0, Math.min(rect.width, x));
            const percent = x / rect.width;
            const value = parseFloat(slider.min) + (parseFloat(slider.max) - parseFloat(slider.min)) * percent;
            slider.value = Math.min(parseFloat(slider.max), Math.max(parseFloat(slider.min), value)).toString();
            updateThresholdFromSlider(slider, thumbId, badgeId, displayId, suffix);
            autoSave();
          };
          const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      }
    }

    // Send threshold via BLE
    async function sendThreshold(key: string, value: number) {
      if (!configCharacteristic || !isConnected) {
        console.log('Not connected, cannot send');
        return false;
      }
      try {
        const command = `${key}:${value}`;
        const encoder = new TextEncoder();
        await configCharacteristic.writeValue(encoder.encode(command));
        console.log(`Sent: ${command}`);
        return true;
      } catch (error) {
        console.warn('Send error:', error);
        return false;
      }
    }

    // Save all thresholds to device with validation
    async function saveAllThresholds() {
      // Check for duplicate actions first
      const conflict = checkForDuplicateActions();
      if (conflict) {
        setActionConflict(conflict);
        setTimeout(() => setActionConflict(null), 3000);
        console.warn('Cannot save:', conflict);
        return;
      }
      
      const blink = parseInt(blinkSlider.value);
      const jawOn = parseInt(jawOnSlider.value);
      const emgLeft = parseInt(emgLeftSlider.value);
      const emgRight = parseInt(emgRightSlider.value);
      const blinkAction = parseInt(blinkActionSelect.value);
      const leftEMGAction = parseInt(leftEMGActionSelect.value);
      const rightEMGAction = parseInt(rightEMGActionSelect.value);
      const jawReleaseAction = parseInt(jawReleaseActionSelect.value);
      const jawHoldAction = parseInt(jawHoldActionSelect.value);

      await sendThreshold('BLINK', blink);
      await new Promise(r => setTimeout(r, 100));
      await sendThreshold('JAW_ON', jawOn);
      await new Promise(r => setTimeout(r, 100));
      await sendThreshold('EMG_LEFT', emgLeft);
      await new Promise(r => setTimeout(r, 100));
      await sendThreshold('EMG_RIGHT', emgRight);
      await new Promise(r => setTimeout(r, 100));
      await sendThreshold('BLINK_ACTION', blinkAction);
      await new Promise(r => setTimeout(r, 100));
      await sendThreshold('LEFT_EMG_ACTION', leftEMGAction);
      await new Promise(r => setTimeout(r, 100));
      await sendThreshold('RIGHT_EMG_ACTION', rightEMGAction);
      await new Promise(r => setTimeout(r, 100));
      await sendThreshold('JAW_RELEASE_ACTION', jawReleaseAction);
      await new Promise(r => setTimeout(r, 100));
      await sendThreshold('JAW_HOLD_ACTION', jawHoldAction);

      currentThresholds = { 
        blink, jawOn, emgLeft, emgRight, 
        blinkAction, leftEMGAction, rightEMGAction, 
        jawReleaseAction, jawHoldAction 
      };

      const msg = document.getElementById('saveSuccess');
      if (msg) {
        (msg as HTMLElement).style.display = 'block';
        setTimeout(() => (msg as HTMLElement).style.display = 'none', 1500);
      }
      console.log('All thresholds saved');
    }

    function autoSave() {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(saveAllThresholds, 800);
    }

    // Request thresholds from device
    async function requestThresholds() {
      if (!configCharacteristic || !isConnected) return;
      try {
        const encoder = new TextEncoder();
        await configCharacteristic.writeValue(encoder.encode('GET_THRESHOLDS'));
        console.log('Requested thresholds');
      } catch (error) {
        console.warn('Request error:', error);
      }
    }

    // Send EXIT_CONFIG command
    async function sendExitConfig() {
      if (!configCharacteristic || !isConnected) {
        console.log('Not connected, cannot send EXIT_CONFIG');
        return false;
      }
      try {
        const encoder = new TextEncoder();
        await configCharacteristic.writeValue(encoder.encode('EXIT_CONFIG'));
        console.log('Sent EXIT_CONFIG command');
        return true;
      } catch (error) {
        console.warn('Send EXIT_CONFIG error:', error);
        return false;
      }
    }

    // Parse incoming BLE data
    function parseData(dataString: string) {
      try {
        const pairs = dataString.split(',');
        let data: any = {};
        for (let pair of pairs) {
          const [key, value] = pair.split(':');
          if (key && value) {
            data[key] = parseFloat(value);
          }
        }
        return data;
      } catch (e) {
        return null;
      }
    }

    // Update UI from BLE data
    function updateUIFromData(data: any) {
      // Live values
      if (data.EEG !== undefined) {
        updateLiveDisplay('blinkLiveFill', 'blinkLiveLabel', data.EEG, 0, 200, '');
      }
      if (data.JAW !== undefined) {
        updateLiveDisplay('jawOnLiveFill', 'jawOnLiveLabel', data.JAW, 0, 100, '');
      }
      if (data.LEFT !== undefined) {
        updateLiveDisplay('emg1LiveFill', 'emg1LiveLabel', data.LEFT, 0, 300, '');
      }
      if (data.RIGHT !== undefined) {
        updateLiveDisplay('emg2LiveFill', 'emg2LiveLabel', data.RIGHT, 0, 300, '');
      }

      // Thresholds from device
      if (data.BLINK_THRESH !== undefined && data.BLINK_THRESH !== currentThresholds.blink) {
        currentThresholds.blink = data.BLINK_THRESH;
        isUpdatingFromServer = true;
        blinkSlider.value = data.BLINK_THRESH.toString();
        updateThresholdFromSlider(blinkSlider, 'blinkThresholdThumb', 'blinkThresholdBadge', 'blinkThresholdDisplay', '');
        isUpdatingFromServer = false;
      }
      if (data.JAW_ON !== undefined && data.JAW_ON !== currentThresholds.jawOn) {
        currentThresholds.jawOn = data.JAW_ON;
        isUpdatingFromServer = true;
        jawOnSlider.value = data.JAW_ON.toString();
        updateThresholdFromSlider(jawOnSlider, 'jawOnThresholdThumb', 'jawOnThresholdBadge', 'jawOnDisplay', '');
        isUpdatingFromServer = false;
      }
      if (data.EMG_LEFT !== undefined && data.EMG_LEFT !== currentThresholds.emgLeft) {
        currentThresholds.emgLeft = data.EMG_LEFT;
        isUpdatingFromServer = true;
        emgLeftSlider.value = data.EMG_LEFT.toString();
        updateThresholdFromSlider(emgLeftSlider, 'emg1ThresholdThumb', 'emg1ThresholdBadge', 'emgLeftDisplay', '');
        isUpdatingFromServer = false;
      }
      if (data.EMG_RIGHT !== undefined && data.EMG_RIGHT !== currentThresholds.emgRight) {
        currentThresholds.emgRight = data.EMG_RIGHT;
        isUpdatingFromServer = true;
        emgRightSlider.value = data.EMG_RIGHT.toString();
        updateThresholdFromSlider(emgRightSlider, 'emg2ThresholdThumb', 'emg2ThresholdBadge', 'emgRightDisplay', '');
        isUpdatingFromServer = false;
      }
      
      // Action mappings from device
      if (data.BLINK_ACTION !== undefined && data.BLINK_ACTION !== currentThresholds.blinkAction) {
        currentThresholds.blinkAction = data.BLINK_ACTION;
        isUpdatingFromServer = true;
        blinkActionSelect.value = data.BLINK_ACTION.toString();
        isUpdatingFromServer = false;
      }
      if (data.LEFT_EMG_ACTION !== undefined && data.LEFT_EMG_ACTION !== currentThresholds.leftEMGAction) {
        currentThresholds.leftEMGAction = data.LEFT_EMG_ACTION;
        isUpdatingFromServer = true;
        leftEMGActionSelect.value = data.LEFT_EMG_ACTION.toString();
        isUpdatingFromServer = false;
      }
      if (data.RIGHT_EMG_ACTION !== undefined && data.RIGHT_EMG_ACTION !== currentThresholds.rightEMGAction) {
        currentThresholds.rightEMGAction = data.RIGHT_EMG_ACTION;
        isUpdatingFromServer = true;
        rightEMGActionSelect.value = data.RIGHT_EMG_ACTION.toString();
        isUpdatingFromServer = false;
      }
      if (data.JAW_RELEASE_ACTION !== undefined && data.JAW_RELEASE_ACTION !== currentThresholds.jawReleaseAction) {
        currentThresholds.jawReleaseAction = data.JAW_RELEASE_ACTION;
        isUpdatingFromServer = true;
        jawReleaseActionSelect.value = data.JAW_RELEASE_ACTION.toString();
        isUpdatingFromServer = false;
      }
      if (data.JAW_HOLD_ACTION !== undefined && data.JAW_HOLD_ACTION !== currentThresholds.jawHoldAction) {
        currentThresholds.jawHoldAction = data.JAW_HOLD_ACTION;
        isUpdatingFromServer = true;
        jawHoldActionSelect.value = data.JAW_HOLD_ACTION.toString();
        isUpdatingFromServer = false;
      }

      if (data.BLINK_THRESH !== undefined && !isConfigMode) {
        isConfigMode = true;
        const badge = document.getElementById('configBadge');
        const led = document.getElementById('statusLed');
        if (badge) (badge as HTMLElement).style.display = 'inline-block';
        if (led) led.classList.add('config-mode');
      }
    }

    // Handle BLE notifications
    function handleDataNotification(event: any) {
      try {
        const decoder = new TextDecoder('utf-8');
        const value = decoder.decode(event.target.value);
        const data = parseData(value);
        if (data) {
          updateUIFromData(data);
        }
      } catch (e) {
        console.warn('Notification error:', e);
      }
    }

    // Update available options in dropdowns based on selections
    function updateDropdownOptions(changedSelect: HTMLSelectElement, changedValue: string) {
      const selects = [blinkActionSelect, leftEMGActionSelect, rightEMGActionSelect, jawReleaseActionSelect, jawHoldActionSelect];
      const currentValues = selects.map(s => s?.value);
      
      selects.forEach(select => {
        if (select && select !== changedSelect) {
          const options = select.options;
          for (let i = 0; i < options.length; i++) {
            const option = options[i];
            // Don't disable NO ACTION (value 0) for other selects
            if (option.value !== "0" && currentValues.includes(option.value) && option.value !== changedValue) {
              option.disabled = true;
              option.style.opacity = '0.5';
            } else {
              option.disabled = false;
              option.style.opacity = '1';
            }
          }
        }
      });
    }

    // Setup action dropdown listeners with validation
    function setupActionListeners() {
      const updateAndCheck = (select: HTMLSelectElement) => {
        if (!isUpdatingFromServer && isConnected) {
          updateDropdownOptions(select, select.value);
          autoSave();
        }
      };
      
      if (blinkActionSelect) {
        blinkActionSelect.addEventListener('change', () => updateAndCheck(blinkActionSelect));
      }
      if (leftEMGActionSelect) {
        leftEMGActionSelect.addEventListener('change', () => updateAndCheck(leftEMGActionSelect));
      }
      if (rightEMGActionSelect) {
        rightEMGActionSelect.addEventListener('change', () => updateAndCheck(rightEMGActionSelect));
      }
      if (jawReleaseActionSelect) {
        jawReleaseActionSelect.addEventListener('change', () => updateAndCheck(jawReleaseActionSelect));
      }
      if (jawHoldActionSelect) {
        jawHoldActionSelect.addEventListener('change', () => updateAndCheck(jawHoldActionSelect));
      }
    }

    // BLE Connection
    const connectBLE = async function () {
      try {
        if (!navigator.bluetooth) {
          alert('Web Bluetooth not supported. Use Chrome/Edge/Brave.');
          return;
        }

        setLoading(true);

        bleDevice = await navigator.bluetooth.requestDevice({
          filters: [{ services: [SERVICE_UUID] }] as any,
          optionalServices: [SERVICE_UUID]
        });

        const server = await bleDevice.gatt.connect();
        const service = await server.getPrimaryService(SERVICE_UUID);
        dataCharacteristic = await service.getCharacteristic(DATA_CHAR_UUID);
        configCharacteristic = await service.getCharacteristic(CONFIG_CHAR_UUID);

        await dataCharacteristic.startNotifications();
        dataCharacteristic.addEventListener('characteristicvaluechanged', handleDataNotification);

        isConnected = true;
        configCharacteristicRef.current = configCharacteristic;
        isConnectedRef.current = true;

        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        const led = document.getElementById('statusLed');
        const status = document.getElementById('connectionStatus');

        if (connectBtn) (connectBtn as HTMLElement).style.display = 'none';
        if (disconnectBtn) (disconnectBtn as HTMLElement).style.display = 'inline-block';
        if (led) led.classList.add('connected');
        if (status) status.innerText = 'Connected';

        // Request current thresholds
        await requestThresholds();

        bleDevice.addEventListener('gattserverdisconnected', onDisconnected);

        setLoading(false);
        console.log('Connected to device');
      } catch (error: any) {
        setLoading(false);
        console.warn('Connection error:', error);
      }
    }

    function onDisconnected() {
      isConnected = false;
      isConfigMode = false;
      configCharacteristicRef.current = null;
      isConnectedRef.current = false;
      
      const connectBtn = document.getElementById('connectBtn');
      const disconnectBtn = document.getElementById('disconnectBtn');
      const led = document.getElementById('statusLed');
      const status = document.getElementById('connectionStatus');
      const badge = document.getElementById('configBadge');

      if (connectBtn) (connectBtn as HTMLElement).style.display = 'inline-block';
      if (disconnectBtn) (disconnectBtn as HTMLElement).style.display = 'none';
      if (led) {
        led.classList.remove('connected');
        led.classList.remove('config-mode');
      }
      if (status) status.innerText = 'Disconnected';
      if (badge) (badge as HTMLElement).style.display = 'none';
      console.log('Disconnected');
    }

    // Modified Disconnect handler with EXIT_CONFIG
    const disconnectBLE = async function () {
      // Send EXIT_CONFIG before disconnecting
      await sendExitConfig();
      
      // Small delay to ensure command is sent
      setTimeout(() => {
        if (bleDevice && bleDevice.gatt.connected) {
          bleDevice.gatt.disconnect();
        }
        onDisconnected();
      }, 100);
    }

    function setLoading(show: boolean) {
      const btn = document.getElementById('connectBtn') as HTMLButtonElement;
      if (show) {
        btn.textContent = '⏳ Connecting...';
        btn.disabled = true;
      } else {
        btn.textContent = '🔌 Connect BLE';
        btn.disabled = false;
      }
    }

    // Modified Whiteboard click handler
    const handleWhiteboardClick = async (e: Event) => {
      e.preventDefault();
      await sendExitConfig();
      // Navigate to whiteboard after a small delay to ensure command is sent
      setTimeout(() => {
        window.location.href = '/';
      }, 100);
    };

    // Attach event listeners to buttons
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const whiteboardLink = document.querySelector('a[href="/"]');

    if (connectBtn) {
      connectBtn.addEventListener('click', connectBLE);
    }
    if (disconnectBtn) {
      disconnectBtn.removeEventListener('click', disconnectBLE);
      disconnectBtn.addEventListener('click', disconnectBLE);
    }
    if (whiteboardLink) {
      whiteboardLink.removeEventListener('click', handleWhiteboardClick);
      whiteboardLink.addEventListener('click', handleWhiteboardClick);
    }

    // Initialize sliders
    if (blinkSlider) setupSliderDrag(blinkSlider, 'blinkThresholdThumb', 'blinkThresholdBadge', 'blinkThresholdDisplay', '');
    if (jawOnSlider) setupSliderDrag(jawOnSlider, 'jawOnThresholdThumb', 'jawOnThresholdBadge', 'jawOnDisplay', '');
    if (emgLeftSlider) setupSliderDrag(emgLeftSlider, 'emg1ThresholdThumb', 'emg1ThresholdBadge', 'emgLeftDisplay', '');
    if (emgRightSlider) setupSliderDrag(emgRightSlider, 'emg2ThresholdThumb', 'emg2ThresholdBadge', 'emgRightDisplay', '');
    
    // Setup action listeners
    setupActionListeners();

    // Initial UI updates
    if (blinkSlider) updateThresholdFromSlider(blinkSlider, 'blinkThresholdThumb', 'blinkThresholdBadge', 'blinkThresholdDisplay', '');
    if (jawOnSlider) updateThresholdFromSlider(jawOnSlider, 'jawOnThresholdThumb', 'jawOnThresholdBadge', 'jawOnDisplay', '');
    if (emgLeftSlider) updateThresholdFromSlider(emgLeftSlider, 'emg1ThresholdThumb', 'emg1ThresholdBadge', 'emgLeftDisplay', '');
    if (emgRightSlider) updateThresholdFromSlider(emgRightSlider, 'emg2ThresholdThumb', 'emg2ThresholdBadge', 'emgRightDisplay', '');

    // Handle window resize
    window.addEventListener('resize', () => {
      if (blinkSlider) updateThresholdFromSlider(blinkSlider, 'blinkThresholdThumb', 'blinkThresholdBadge', 'blinkThresholdDisplay', '');
      if (jawOnSlider) updateThresholdFromSlider(jawOnSlider, 'jawOnThresholdThumb', 'jawOnThresholdBadge', 'jawOnDisplay', '');
      if (emgLeftSlider) updateThresholdFromSlider(emgLeftSlider, 'emg1ThresholdThumb', 'emg1ThresholdBadge', 'emgLeftDisplay', '');
      if (emgRightSlider) updateThresholdFromSlider(emgRightSlider, 'emg2ThresholdThumb', 'emg2ThresholdBadge', 'emgRightDisplay', '');
    });

    console.log('UI Ready. Click Connect BLE to start');

    // Cleanup
    return () => {
      if (connectBtn) {
        connectBtn.removeEventListener('click', connectBLE);
      }
      if (disconnectBtn) {
        disconnectBtn.removeEventListener('click', disconnectBLE);
      }
      if (whiteboardLink) {
        whiteboardLink.removeEventListener('click', handleWhiteboardClick);
      }
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      if (bleDevice && bleDevice.gatt.connected) {
        bleDevice.gatt.disconnect();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0c12] font-sans flex flex-col">
      {/* Conflict Warning */}
      {actionConflict && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[1300] bg-red-900 text-red-100 px-5 py-2 rounded-full text-sm font-medium shadow-lg border border-red-700">
          ⚠️ {actionConflict}
        </div>
      )}
      
      {/* Main Content - This will push footer down */}
      <div className="flex-1 flex flex-col px-4 py-3">
        <h1 className="text-center text-2xl font-semibold text-[#eef2ff] pb-1.5 tracking-tight shadow-sm">
          NeuroArt Configurator
        </h1>

        <div className="bg-[#14171f] rounded-xl py-2 px-5 mb-2 w-full flex-row flex justify-between gap-3 border border-[#2a2e3a]">
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full bg-red-500 transition-all duration-300" id="statusLed" />
            <span id="connectionStatus" className="text-gray-200">Disconnected</span>
            <span id="configBadge" className="hidden bg-orange-500 px-2 py-0.5 rounded-xl text-xs font-medium">CONFIG MODE</span>
          </div>
          <div className='gap-2 flex'>
            <button id="connectBtn" className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white cursor-pointer rounded-lg border border-gray-600 transition-all text-sm">
              Connect BLE
            </button>
            <button id="disconnectBtn" style={{ display: 'none' }} className="text-white px-3 py-1.5 bg-[#ff416c] hover:bg-[#ff2d55] cursor-pointer rounded-lg border border-gray-600 transition-all text-sm">
              Disconnect
            </button>
            <Link
              href="/"
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-600 transition-all text-sm"
            >
              Whiteboard
            </Link>
          </div>
        </div>

        <div id="saveSuccess" className="hidden fixed top-4 right-5 z-[1200] bg-green-900 text-green-100 px-5 py-2 rounded-full text-sm font-medium shadow-lg border border-green-700">
          ✓ Settings saved
        </div>

        <div className="flex flex-col lg:flex-row gap-4 my-2 mb-1.5">
          {/* Left Column */}
          <div className="flex flex-col gap-3.5 flex-1">
            {/* Eye Blink Card */}
            <div className="bg-[#14171f] rounded-2xl p-4 pb-5 shadow-lg border border-[#2a2e3a]">
              <div className="flex justify-between items-center mb-2">
                <div className="text-xl font-semibold text-[#d6e3ff]">Eye Blink</div>
                <span className="bg-[#1e2432] px-3 py-1 rounded-full text-sm font-semibold text-[#ff9f6e] border border-[#2d3343]">
                  Threshold: <span id="blinkThresholdDisplay">50</span>
                </span>
              </div>
              <div className="relative h-20 cursor-pointer mt-2.5 mb-[30px]" id="blinkContainer">
                <div className="absolute top-1/2 left-0 right-0 h-20 bg-[#232838] -translate-y-1/2 rounded-md shadow-inner" />
                <div id="blinkLiveFill" className="absolute top-1/2 left-0 h-20 -translate-y-1/2 transition-[width] duration-75 rounded-l-md" style={{ background: '#10b981', width: '0%' }} />
                <div id="blinkLiveLabel" className="absolute top-1/2 left-[5%] -translate-x-1/2 -translate-y-1/2 text-white text-xl font-medium whitespace-nowrap pointer-events-none drop-shadow-md">0</div>
                <div id="blinkThresholdThumb" className="absolute top-1/2 w-5 h-[95px] -translate-x-1/2 -translate-y-1/2 cursor-grab z-30 shadow-lg border-2 border-orange-100 rounded" style={{ background: '#ff8a5c', left: '0%' }} />
                <div id="blinkThresholdBadge" className="absolute top-[95px] -translate-x-1/2 bg-[#ff8a5c] text-black px-2 py-0.5 rounded-lg text-2xl font-bold whitespace-nowrap pointer-events-none z-25 shadow-md border border-[#ffbb95]">0</div>
                <input type="range" id="blinkSlider" className="absolute w-full h-10 opacity-0 cursor-pointer z-35 top-1/2 -translate-y-1/2" min="0" max="200" step="1" defaultValue="50" />
              </div>
              {/* Action Dropdown */}
              <div >
                <label className="text-sm font-medium text-gray-400 block mb-2">Action on Triple Blink:</label>
                <select id="blinkAction" className="w-full bg-[#1e2432] text-white rounded-lg px-3 py-2 border border-[#2d3343] focus:outline-none focus:border-[#ff8a5c]" defaultValue="3">
                  <option value="3">SHAPE SELECTION</option>
                  <option value="8">RIGHT AND UP</option>
                  <option value="9">LEFT AND DOWN</option>
                  <option value="2">MENU OPEN AND SWITCH</option>
                  <option value="0">NO ACTION</option>
                </select>
              </div>
            </div>

            {/* Jaw Muscle Card */}
            <div className="bg-[#14171f] rounded-2xl p-4 pb-5 shadow-lg border border-[#2a2e3a]">
              <div className="flex justify-between items-center mb-2">
                <div className="text-xl font-semibold text-[#d6e3ff]">Jaw Clench</div>
                <span className="bg-[#1e2432] px-3 py-1 rounded-full text-sm font-semibold text-[#ff9f6e] border border-[#2d3343]">
                  Threshold: <span id="jawOnDisplay">40</span>
                </span>
              </div>
              <div className="relative h-20 cursor-pointer mt-2.5 mb-[30px]" id="jawOnContainer">
                <div className="absolute top-1/2 left-0 right-0 h-20 bg-[#232838] -translate-y-1/2 rounded-md shadow-inner" />
                <div id="jawOnLiveFill" className="absolute top-1/2 left-0 h-20 -translate-y-1/2 transition-[width] duration-75 rounded-l-md" style={{ background: '#f59e0b', width: '0%' }} />
                <div id="jawOnLiveLabel" className="absolute top-1/2 left-[5%] -translate-x-1/2 -translate-y-1/2 text-white text-xl font-medium whitespace-nowrap pointer-events-none drop-shadow-md">0</div>
                <div id="jawOnThresholdThumb" className="absolute top-1/2 w-5 h-[95px] -translate-x-1/2 -translate-y-1/2 cursor-grab z-30 shadow-lg border-2 border-orange-100 rounded" style={{ background: '#ff8a5c', left: '0%' }} />
                <div id="jawOnThresholdBadge" className="absolute top-[95px] -translate-x-1/2 bg-[#ff8a5c] text-black px-2 py-0.5 rounded-lg text-2xl font-bold whitespace-nowrap pointer-events-none z-25 shadow-md border border-[#ffbb95]">0</div>
                <input type="range" id="jawOnSlider" className="absolute w-full h-10 opacity-0 cursor-pointer z-35 top-1/2 -translate-y-1/2" min="0" max="100" step="1" defaultValue="40" />
              </div>
              {/* Action Dropdown for Jaw Clench */}
              <div className="mb-3">
                <label className="text-sm font-medium text-gray-400 block mb-2">Action on Jaw Clench:</label>
                <select id="jawReleaseAction" className="w-full bg-[#1e2432] text-white rounded-lg px-3 py-2 border border-[#2d3343] focus:outline-none focus:border-[#ff8a5c]" defaultValue="2">
                  <option value="2">MENU OPEN AND SWITCH</option>
                  <option value="3">SHAPE SELECTION</option>
                  <option value="8">RIGHT AND UP</option>
                  <option value="9">LEFT AND DOWN</option>
                  <option value="0">NO ACTION</option>
                </select>
              </div>
              {/* Action Dropdown for Jaw Hold */}
              <div>
                <label className="text-sm font-medium text-gray-400 block mb-2">Action on Jaw Hold (3+ sec):</label>
                <select id="jawHoldAction" className="w-full bg-[#1e2432] text-white rounded-lg px-3 py-2 border border-[#2d3343] focus:outline-none focus:border-[#ff8a5c]" defaultValue="0">
                  <option value="2">MENU OPEN AND SWITCH</option>
                  <option value="3">SHAPE SELECTION</option>
                  <option value="8">RIGHT AND UP</option>
                  <option value="9">LEFT AND DOWN</option>
                  <option value="0">NO ACTION</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="flex flex-col gap-3.5 flex-1">
            {/* Right Hand EMG */}
            <div className="bg-[#14171f] rounded-2xl p-4 pb-5 shadow-lg border border-[#2a2e3a]">
              <div className="flex justify-between items-center mb-2">
                <div className="text-xl font-semibold text-[#d6e3ff]">Right Hand EMG</div>
                <span className="bg-[#1e2432] px-3 py-1 rounded-full text-sm font-semibold text-[#ff9f6e] border border-[#2d3343]">
                  Threshold: <span id="emgRightDisplay">150</span>
                </span>
              </div>
              <div className="relative h-20 cursor-pointer mt-2.5 mb-[30px]" id="emg2Container">
                <div className="absolute top-1/2 left-0 right-0 h-20 bg-[#232838] -translate-y-1/2 rounded-md shadow-inner" />
                <div id="emg2LiveFill" className="absolute top-1/2 left-0 h-20 -translate-y-1/2 transition-[width] duration-75 rounded-l-md" style={{ background: '#f97316', width: '0%' }} />
                <div id="emg2LiveLabel" className="absolute top-1/2 left-[5%] -translate-x-1/2 -translate-y-1/2 text-white text-xl font-medium whitespace-nowrap pointer-events-none drop-shadow-md">0</div>
                <div id="emg2ThresholdThumb" className="absolute top-1/2 w-5 h-[95px] -translate-x-1/2 -translate-y-1/2 cursor-grab z-30 shadow-lg border-2 border-orange-100 rounded" style={{ background: '#ff8a5c', left: '0%' }} />
                <div id="emg2ThresholdBadge" className="absolute top-[95px] -translate-x-1/2 bg-[#ff8a5c] text-black px-2 py-0.5 rounded-lg text-2xl font-bold whitespace-nowrap pointer-events-none z-25 shadow-md border border-[#ffbb95]">0</div>
                <input type="range" id="emgRightSlider" className="absolute w-full h-10 opacity-0 cursor-pointer z-35 top-1/2 -translate-y-1/2" min="0" max="300" step="5" defaultValue="150" />
              </div>
              {/* Action Dropdown */}
              <div >
                <label className="text-sm font-medium text-gray-400 block mb-2">Action on Right EMG:</label>
                <select id="rightEMGAction" className="w-full bg-[#1e2432] text-white rounded-lg px-3 py-2 border border-[#2d3343] focus:outline-none focus:border-[#ff8a5c]" defaultValue="8">
                  <option value="8">RIGHT AND UP</option>
                  <option value="9">LEFT AND DOWN</option>
                  <option value="3">SHAPE SELECTION</option>
                  <option value="2">MENU OPEN AND SWITCH</option>
                  <option value="0">NO ACTION</option>
                </select>
              </div>
            </div>

            {/* Left Hand EMG */}
            <div className="bg-[#14171f] rounded-2xl p-4 pb-5 shadow-lg border border-[#2a2e3a]">
              <div className="flex justify-between items-center mb-2">
                <div className="text-xl font-semibold text-[#d6e3ff]">Left Hand EMG</div>
                <span className="bg-[#1e2432] px-3 py-1 rounded-full text-sm font-semibold text-[#ff9f6e] border border-[#2d3343]">
                  Threshold: <span id="emgLeftDisplay">150</span>
                </span>
              </div>
              <div className="relative h-20 cursor-pointer mt-2.5 mb-[30px]" id="emg1Container">
                <div className="absolute top-1/2 left-0 right-0 h-20 bg-[#232838] -translate-y-1/2 rounded-md shadow-inner" />
                <div id="emg1LiveFill" className="absolute top-1/2 left-0 h-20 -translate-y-1/2 transition-[width] duration-75 rounded-l-md" style={{ background: '#f97316', width: '0%' }} />
                <div id="emg1LiveLabel" className="absolute top-1/2 left-[5%] -translate-x-1/2 -translate-y-1/2 text-white text-xl font-medium whitespace-nowrap pointer-events-none drop-shadow-md">0</div>
                <div id="emg1ThresholdThumb" className="absolute top-1/2 w-5 h-[95px] -translate-x-1/2 -translate-y-1/2 cursor-grab z-30 shadow-lg border-2 border-orange-100 rounded" style={{ background: '#ff8a5c', left: '0%' }} />
                <div id="emg1ThresholdBadge" className="absolute top-[95px] -translate-x-1/2 bg-[#ff8a5c] text-black px-2 py-0.5 rounded-lg text-2xl font-bold whitespace-nowrap pointer-events-none z-25 shadow-md border border-[#ffbb95]">0</div>
                <input type="range" id="emgLeftSlider" className="absolute w-full h-10 opacity-0 cursor-pointer z-35 top-1/2 -translate-y-1/2" min="0" max="300" step="5" defaultValue="150" />
              </div>
              {/* Action Dropdown */}
              <div >
                <label className="text-sm font-medium text-gray-400 block mb-2">Action on Left EMG:</label>
                <select id="leftEMGAction" className="w-full bg-[#1e2432] text-white rounded-lg px-3 py-2 border border-[#2d3343] focus:outline-none focus:border-[#ff8a5c]" defaultValue="9">
                  <option value="9">LEFT AND DOWN</option>
                  <option value="8">RIGHT AND UP</option>
                  <option value="3">SHAPE SELECTION</option>
                  <option value="2">MENU OPEN AND SWITCH</option>
                  <option value="0">NO ACTION</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer - Always at bottom */}
      <div className="flex-shrink-0 text-center py-2 text-[1.1rem] font-semibold text-[#a5b3cf] flex justify-center gap-[6px] bg-[#0a0c12]">
        Made with ❤️ by <a href="#" className="text-[#ff9f6e] hover:underline">Upside Down Labs</a>
      </div>
    </div>
  );
};

export default NeuroArtConfigurator;
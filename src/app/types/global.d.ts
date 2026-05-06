// types/global.d.ts
declare global {
  interface BluetoothDevice {
    gatt?: BluetoothRemoteGATTServer;
    name?: string;
    addEventListener: (event: string, listener: EventListener) => void;
  }

  interface BluetoothRemoteGATTCharacteristic {
    properties: {
      notify: boolean;
    };
    startNotifications: () => Promise<BluetoothRemoteGATTCharacteristic>;
    addEventListener: (event: string, listener: EventListener) => void;
    readValue: () => Promise<DataView>;
    value?: DataView;
  }

  interface Navigator {
    bluetooth?: {
      requestDevice: (options: RequestDeviceOptions) => Promise<BluetoothDevice>;
    };
  }

  interface RequestDeviceOptions {
    filters?: Array<{ name?: string; namePrefix?: string }>;
    optionalServices?: string[];
  }
}

export {};
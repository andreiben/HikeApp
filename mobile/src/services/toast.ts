import Toast from "react-native-toast-message";

type ToastText = {
  title: string;
  message?: string;
};

function showToast(type: "success" | "error" | "info", { title, message }: ToastText) {
  Toast.show({
    type,
    text1: title,
    text2: message,
  });
}

export function showSuccess(title: string, message?: string) {
  showToast("success", { title, message });
}

export function showError(title: string, message?: string) {
  showToast("error", { title, message });
}

export function showInfo(title: string, message?: string) {
  showToast("info", { title, message });
}

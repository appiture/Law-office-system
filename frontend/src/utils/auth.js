export const isAuthenticated = () => true;

export const getAuthToken = () => "demo-token";

export const getUserRole = () => "FOUNDER";

export const getUserEmail = () => "founder@lawoffice.com";

export const storeAuthSession = () => {};
export const clearAuthData = () => {};
export const fullLogout = () => {
    window.location.href = "/";
};
export const getRememberedEmail = () => "";
export const setRememberedEmail = () => {};
export const isRememberEmailEnabled = () => false;

let currentUser = null;

export const setUser = (user) => {
  currentUser = user;
};

export const getUser = () => currentUser;

export const clearUser = () => {
  currentUser = null;
};
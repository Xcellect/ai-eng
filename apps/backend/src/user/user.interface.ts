export interface IUserData {
  bio: string;
  email: string;
  image?: string;
  token: string;
  username: string;
}

export interface IUserRO {
  user: IUserData;
}

// user.interface.ts
export interface IPublicUserRO {
  user: IPublicUserData;
}

export interface IPublicUserData {
  bio: string;
  email: string;
  image: string;
  username: string;
}

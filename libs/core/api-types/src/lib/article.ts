import { Profile } from './profile';

export interface Article {
  slug: string;
  title: string;
  description: string;
  body: string;
  tagList: string[];
  createdAt: string;
  updatedAt: string;
  favorited: boolean;
  favoritesCount: number;
  author: Profile;
  authors: Profile[];
  authorEmails: string[];
  lockedBy: Profile;
  lockedAt: string;
}

export interface EditArticlePayload {
  slug: string;
  title: string;
  description: string;
  body: string;
  tagList: string[];
  authors: number[];
  lockedBy: number;
  lockedAt: string;
}

export interface ArticleResponse {
  article: Article;
}

export interface EditArticleResponse {
  article: EditArticlePayload;
}

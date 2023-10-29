import { Profile } from './profile';
import { User } from './user';

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
}

export interface ArticleResponse {
  article: Article;
}

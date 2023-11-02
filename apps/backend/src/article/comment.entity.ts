import { Collection, Entity, ManyToMany, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { User } from '../user/user.entity';
import { Article } from './article.entity';

@Entity()
export class Comment {
  @PrimaryKey({ type: 'number' })
  id!: number;

  @Property({ type: 'date' })
  createdAt = new Date();

  @Property({ type: 'date', onUpdate: () => new Date() })
  updatedAt = new Date();

  @Property()
  body: string;

  @ManyToOne(() => Article)
  article: Article;

  @ManyToOne(() => User)
  author: User;

  @ManyToMany(() => User)
  authors = new Collection<User>(this);

  constructor(author: User, article: Article, body: string) {
    this.author = author;
    this.article = article;
    this.body = body;
  }
}

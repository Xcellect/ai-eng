import { Injectable } from '@nestjs/common';
import { EntityManager, QueryOrder, wrap } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/mysql';
import { Tag } from '../tag/tag.entity';
import { User } from '../user/user.entity';
import { Article } from './article.entity';
import { IArticleRO, IArticlesRO, ICommentsRO } from './article.interface';
import { Comment } from './comment.entity';
import { CreateArticleDto, CreateCommentDto } from './dto';

@Injectable()
export class ArticleService {
  constructor(
    private readonly em: EntityManager,
    @InjectRepository(Article)
    private readonly articleRepository: EntityRepository<Article>,
    @InjectRepository(Comment)
    private readonly commentRepository: EntityRepository<Comment>,
    @InjectRepository(User)
    private readonly userRepository: EntityRepository<User>,
  ) {}

  async findAll(userId: number, query: Record<string, string>): Promise<IArticlesRO> {
    const user = userId
      ? await this.userRepository.findOne(userId, { populate: ['followers', 'favorites'] })
      : undefined;
    const qb = this.articleRepository.createQueryBuilder('a').select('a.*').leftJoin('a.author', 'u');
    if ('tag' in query) {
      qb.andWhere({ tagList: new RegExp(query.tag) });
    }

    if ('author' in query) {
      const author = await this.userRepository.findOne({ username: query.author });

      if (!author) {
        return { articles: [], articlesCount: 0 };
      }

      qb.andWhere({ author: author.id });
    }

    if ('favorited' in query) {
      const author = await this.userRepository.findOne({ username: query.favorited }, { populate: ['favorites'] });

      if (!author) {
        return { articles: [], articlesCount: 0 };
      }

      const ids = author.favorites.$.getIdentifiers();
      qb.andWhere({ author: ids });
    }

    qb.orderBy({ createdAt: QueryOrder.DESC });
    const articlesCount = await qb.clone().count('a.id', true).execute('get'); // Removed DISTINCT from count

    if ('limit' in query) {
      qb.limit(+query.limit);
    }

    if ('offset' in query) {
      qb.offset(+query.offset);
    }

    const articles = await qb.getResult();
    // Populate authors for each article
    const populatedArticles = await Promise.all(
      articles.map(async (article) => {
        await article.authors.init(); // Initialize the authors collection
        return article.toJSON(user ? user : undefined); // Pass undefined if user is not defined
      }),
    );

    return { articles: populatedArticles, articlesCount: articlesCount.count };
  }

  async findFeed(userId: number, query: Record<string, string>): Promise<IArticlesRO> {
    const user = userId
      ? await this.userRepository.findOne(userId, { populate: ['followers', 'favorites'] })
      : undefined;
    const res = await this.articleRepository.findAndCount(
      { author: { followers: userId } },
      {
        populate: ['author', 'authors'],
        orderBy: { createdAt: QueryOrder.DESC },
        limit: +query.limit,
        offset: +query.offset,
      },
    );

    console.log('findFeed', { articles: res[0], articlesCount: res[1] });
    return { articles: res[0].map((a) => a.toJSON(user!)), articlesCount: res[1] };
  }

  async findOne(userId: number, where: Partial<Article>): Promise<IArticleRO> {
    const user = userId
      ? await this.userRepository.findOneOrFail(userId, { populate: ['followers', 'favorites'] })
      : undefined;
    const article = await this.articleRepository.findOne(where, { populate: ['author', 'authors'] });
    if (!article) {
      throw new Error('Article not found');
    }
    if (article.lockedBy && article.lockedBy.id !== 0) {
      console.log('Article is locked by another user');
      //throw new Error('Article is locked by another user');
    }

    return { article: article && article.toJSON(user) } as IArticleRO;
  }

  async addComment(userId: number, slug: string, dto: CreateCommentDto) {
    const article = await this.articleRepository.findOneOrFail({ slug }, { populate: ['author', 'authors'] });
    const author = await this.userRepository.findOneOrFail(userId);
    const comment = new Comment(author, article, dto.body);
    await this.em.persistAndFlush(comment);

    return { comment, article: article.toJSON(author) };
  }

  async deleteComment(userId: number, slug: string, id: number): Promise<IArticleRO> {
    const article = await this.articleRepository.findOneOrFail({ slug }, { populate: ['author', 'authors'] });
    const user = await this.userRepository.findOneOrFail(userId);
    const comment = this.commentRepository.getReference(id);

    if (article.comments.contains(comment)) {
      article.comments.remove(comment);
      await this.em.removeAndFlush(comment);
    }

    return { article: article.toJSON(user) };
  }

  async lockArticle(lockedBy: number, lockedAt: string, slug: string): Promise<void> {
    const article = await this.articleRepository.findOne({ slug }, { populate: ['lockedBy'] });
    if (!article) {
      throw new Error('Article not found');
    }
    if (article.lockedBy && article.lockedBy.id !== 0) {
      throw new Error('Article is already locked by another user');
    }
    const user = await this.userRepository.findOneOrFail(lockedBy);
    article.lockedBy = user;
    article.lockedAt = new Date(lockedAt);
    await this.em.flush();
  }

  async unlockArticle(slug: string): Promise<void> {
    const article = await this.articleRepository.findOne({ slug }, { populate: ['lockedBy'] });
    if (!article) {
      throw new Error('Article not found');
    }
    if (article.lockedBy) {
      article.lockedBy = null as any;
      article.lockedAt = null as any;
      await this.em.flush();
    } else {
      throw new Error('Article is not locked');
    }
  }

  async favorite(id: number, slug: string): Promise<IArticleRO> {
    const article = await this.articleRepository.findOneOrFail({ slug }, { populate: ['author', 'authors'] });
    const user = await this.userRepository.findOneOrFail(id, { populate: ['favorites', 'followers'] });

    if (!user.favorites.contains(article)) {
      user.favorites.add(article);
      article.favoritesCount++;
    }

    await this.em.flush();
    return { article: article.toJSON(user) };
  }

  async unFavorite(id: number, slug: string): Promise<IArticleRO> {
    const article = await this.articleRepository.findOneOrFail({ slug }, { populate: ['author', 'authors'] });
    const user = await this.userRepository.findOneOrFail(id, { populate: ['followers', 'favorites'] });

    if (user.favorites.contains(article)) {
      user.favorites.remove(article);
      article.favoritesCount--;
    }

    await this.em.flush();
    return { article: article.toJSON(user) };
  }

  async findComments(slug: string): Promise<ICommentsRO> {
    const article = await this.articleRepository.findOne({ slug }, { populate: ['comments'] });
    return { comments: article!.comments.getItems() };
  }

  async create(userId: number, dto: CreateArticleDto) {
    const user = await this.userRepository.findOne(
      { id: userId },
      { populate: ['followers', 'favorites', 'articles'] },
    );
    const article = new Article(user!, dto.title, dto.description, dto.body);
    user?.articles.add(article);
    await this.em.flush();

    // update tags
    article.tagList = Array.isArray(dto.tagList) ? dto.tagList : [dto.tagList];
    await this.updateTags(article, article.tagList);

    console.log('NEW ARTICLE' + dto.tagList);
    console.log('NEW ARTICLE' + article.tagList);
    return { article: article.toJSON(user!) };
  }

  private async updateTags(article: Article, taglist: string[]) {
    // Insert new tags into the tag table
    for (const tag of taglist) {
      const cleanedTags = tag.split(',').map((t) => t.trim());
      for (const cleanedTag of cleanedTags) {
        const existingTag = await this.em.findOne(Tag, { tag: cleanedTag });
        if (!existingTag) {
          const newTag = new Tag();
          newTag.tag = cleanedTag;
          await this.em.persistAndFlush(newTag);
        }
      }
    }
  }

  async update(userId: number, slug: string, articleData: any): Promise<IArticleRO> {
    const user = await this.userRepository.findOne(
      { id: userId },
      { populate: ['followers', 'favorites', 'articles'] },
    );
    const article = await this.articleRepository.findOne({ slug }, { populate: ['author', 'authors'] });
    if (!article) {
      throw new Error('Article not found');
    }
    if (article.lockedBy && article.lockedBy.id !== 0) {
      console.log('Article is locked by another user');
      //throw new Error('Article is locked by another user');
    }
    article.lockedBy = user!;
    article.lockedAt = new Date();
    // Handle authors
    if (articleData.authors) {
      const authors = await this.userRepository.find({
        email: { $in: articleData.authors },
      });
      if (article.authors) {
        article.authors.set(authors);
      }
    }

    if (article) {
      wrap(article).assign(articleData);
      await this.em.flush();
      await this.updateTags(article, article.tagList);
    }

    return { article: article!.toJSON(user!) };
  }

  async delete(slug: string) {
    return this.articleRepository.nativeDelete({ slug });
  }
}
function In(authors: any): import('@mikro-orm/core/typings').FilterValue<string> | undefined {
  throw new Error('Function not implemented.');
}

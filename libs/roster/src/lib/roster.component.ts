import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Observable, forkJoin } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { articleListInitialState, articleListQuery, articleListActions, ListType } from '@realworld/articles/data-access';
import { selectLoggedIn } from '@realworld/auth/data-access';
import { Store } from '@ngrx/store';
import { ApiService } from '@realworld/core/http-client';
import { RosterStoreService } from './roster.store';
import { CommonModule } from '@angular/common';  // Import CommonModule

interface UserStat {
  username: string;
  profileLink: string;
  articles: number;
  likes: number;
  firstArticleDate: string;
}

@UntilDestroy()
@Component({
  selector: 'cdt-roster',
  standalone: true,
  templateUrl: './roster.component.html',
  styleUrls: ['./roster.component.css'],
  imports: [CommonModule],  // Add CommonModule to imports
  providers: [RosterStoreService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RosterComponent implements OnInit {
  listConfig$ = this.store.select(articleListQuery.selectListConfig);
  userStats$!: Observable<UserStat[]>;
  isAuthenticated = false;

  constructor(
    private readonly store: Store,
    private apiService: ApiService,
    private readonly rosterStore: RosterStoreService
  ) {}

  ngOnInit() {
    this.store
      .select(selectLoggedIn)
      .pipe(untilDestroyed(this))
      .subscribe((isLoggedIn) => {
        this.isAuthenticated = isLoggedIn;
        this.userStats$ = this.getArticles();
        this.userStats$.subscribe((userStats) => {
          // console.log(userStats);  // Check if userStats is correct here
        });
      });
  }
  
  setListTo(type: ListType = 'ALL') {
    this.store.dispatch(
      articleListActions.setListConfig({
        config: { ...articleListInitialState.listConfig, type },
      })
    );
  }

  getArticles(): Observable<UserStat[]> {
    return this.apiService.get('/articles').pipe(
      switchMap((articleList) => {
        const articles = (articleList as any).articles;
        const authorMap = new Map<string, { likes: number; articles: number; firstArticleDate: string }>();

        const articleObservables = articles.map((article: any) => {
          return this.apiService.get(`/articles/${article.slug}`).pipe(
            tap((articleDetails) => {
              const username = (articleDetails as any).article.author.username;
              const favoritesCount = (articleDetails as any).article.favoritesCount;
              const createdAt = new Date((articleDetails as any).article.createdAt).getTime();

              if (!authorMap.has(username)) {
                authorMap.set(username, { likes: 0, articles: 0, firstArticleDate: createdAt.toString() });
              }

              const authorStat = authorMap.get(username)!;
              authorStat.likes += favoritesCount;
              authorStat.articles += 1;
              authorStat.firstArticleDate = Math.min(parseInt(authorStat.firstArticleDate), createdAt).toString();
            })
          );
        });

        return forkJoin(articleObservables).pipe(
          map(() => {
            const sortedAuthors = [...authorMap.entries()].sort((a, b) => b[1].likes - a[1].likes);

            return sortedAuthors.map(([username, stat]) => ({
              username,
              profileLink: `/profile/${encodeURIComponent(username)}`,
              articles: stat.articles,
              likes: stat.likes,
              firstArticleDate: stat.firstArticleDate,
            }));
          })
        );
        
      })
    );
  }
}

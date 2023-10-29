import { Route } from '@angular/router';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';
import { articleListEffects, articleListFeature, articlesEffects } from '@realworld/articles/data-access';
import { RosterComponent } from './roster.component';

export const ROSTER_ROUTES: Route[] = [
  {
    path: '',
    component: RosterComponent,
    providers: [provideState(articleListFeature), provideEffects(articleListEffects, articlesEffects)],
  },
];

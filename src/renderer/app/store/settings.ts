import { observable } from 'mobx';

export type SettingsSection =
  | 'general'
  | 'privacy'
  | 'paswords'
  | 'advanced'

export class SettingsStore {
  @observable
  public selectedSection: SettingsSection = 'general';

  @observable
  public dialType: 'top-sites' | 'bookmarks' = 'top-sites';

  @observable
  public isDarkTheme = false;

  @observable
  public isShieldToggled = true;

  @observable
  public isMultrinToggled = true;
}
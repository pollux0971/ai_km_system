@i1 @app-shell @phase-1 @standalone
Feature: The shell a person lands in — where they can go, what home shows, and the Material 3 skin all of it wears
  The shell is the frame around every authenticated page: a sidebar that offers
  only the sections this person's roles reach, a home page whose shortcuts can
  never exceed that sidebar, and one Material 3 token source that both the
  stylesheet and the shipped colour scheme are cut from.

  This phase is a backfill. Every automated scenario below goes through the very
  module apps/web itself goes through at runtime — the navigation table, the type
  scale, the shipped stylesheet, the generated colour scheme, the "last touched"
  formatter — which is also the entry point each one's own vitest test uses (see
  FEATURE.md 回填對照表). Nothing here opens a browser: the parts that only exist
  once a window is painted (the rail/drawer/modal breakpoints, the live
  cross-window rail) are phase-2 and the @e2e scenario at the bottom.

  Scenario: The shell stands up on its own, with no browser anywhere
    Given a person signed in to the app shell holding the roles "super_administrator"
    When the app shell is assembled for that person
    Then the app shell's main navigation is labelled "首頁, 對話, 知識庫, 維修助手, ERP 助手"
    And the app shell's home headline is set in "36px" on "44px"

  Scenario Outline: The sidebar offers only the sections this person's roles reach
    Given a person signed in to the app shell holding the roles "<roles>"
    When the app shell is assembled for that person
    Then the app shell's main navigation goes exactly to "<destinations>"

    Examples:
      | roles                                  | destinations                                      |
      | general_user                           | /, /conversations, /knowledge                     |
      | maintenance_engineer                   | /, /conversations, /knowledge, /maintenance       |
      | maintenance_engineer, sales_purchasing | /, /conversations, /knowledge, /maintenance, /erp |
      | a-role-nobody-has-defined-yet          | /, /conversations, /knowledge                     |

  Scenario: Home never offers a shortcut the sidebar is hiding
    Given a person signed in to the app shell holding the roles "sales_purchasing"
    When the app shell is assembled for that person
    Then the app shell's home shortcuts go exactly to "/knowledge, /erp"
    And every home shortcut is also in the app shell's main navigation

  Scenario Outline: A page inside a section demands the roles that section demands
    When the app shell is asked which roles the page "<path>" demands
    Then the app shell demands "<roles>"

    Examples:
      | path                      | roles                                     |
      | /maintenance/mc-1/session | maintenance_engineer, super_administrator |
      | /erp/new                  | sales_purchasing, super_administrator     |
      | /maintenance-report       | nothing in particular                     |

  Scenario: The shell's stylesheet is cut from the token source, not hand-typed beside it
    When the app shell's own stylesheet is read
    Then every Material 3 type scale, shape, elevation, state and motion value in it equals the design token of the same name
    And the app shell's stylesheet declares no colour of its own outside the generated Material 3 theme

  Scenario: The shipped colour scheme is complete, and dark mode really repaints it
    When the app shell's shipped colour scheme is read
    Then every Material 3 colour role has a value in both the light and the dark scheme
    And every colour role except "shadow" and "scrim" changes value between light and dark

  Scenario Outline: Text the shell puts on a coloured surface stays readable
    When the app shell's shipped colour scheme is read
    Then every on-colour and the surface it names contrast at least 4.5 to 1 in the "<mode>" scheme

    Examples:
      | mode  |
      | light |
      | dark  |

  Scenario Outline: A home tile says how long ago its conversation was last touched
    Given the home page is drawn at "2026-08-29T12:00:00.000Z"
    When the app shell puts a conversation last touched "<ago>" on a home tile
    Then the home tile reads "<label>"

    Examples:
      | ago | label    |
      | 5m  | 5 分鐘前 |
      | 3h  | 3 小時前 |
      | 7d  | 7 天前   |

  Scenario: Past a week the home tile gives a date instead of a vaguer "N 天前"
    Given the home page is drawn at "2026-08-29T12:00:00.000Z"
    When the app shell puts a conversation last touched "30d" on a home tile
    Then the home tile does not say "天前"
    And the home tile shows a calendar date containing "2026"

  @e2e @manual
  Scenario: A conversation started in one window turns up in the other window
    Given the same person has the app shell open in two browser windows
    When one window starts a new conversation and sends a message in it
    Then the other window's 歷史對話 rail lists that conversation without being reloaded
    And stopping the API makes both headers say 同步連線中斷,重新連線中…

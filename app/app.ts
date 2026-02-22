import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
//
// @Component({
//   selector: 'app-root',
//   imports: [RouterOutlet],
//   templateUrl: './app.html',
//   styleUrl: './app.scss'
// })
// export class App {
//   protected readonly title = signal('zoom-app');
// }
// import { Component } from '@angular/core';
import { DiagramComponent } from './diagram/diagram.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DiagramComponent],
  template: '<app-diagram />',
})
export class App {}

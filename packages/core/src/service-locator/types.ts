/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ServicesConfig {
  [key: string]:
    | ServiceDefinition
    | {
        [key: string]: ServiceDefinition
      }
}

export interface ServiceDefinition<Args extends any[] = any[]> {
  instance: any
  args?: Args
  events?: {
    create: Args
    destroy: []
    [event: string]: any[]
  }
}

export type ServicesNames<Services extends ServicesConfig> = Exclude<
  keyof Services,
  symbol | number
>

export type ServicesInstancesNames<Services extends ServicesConfig> =
  | `${ServicesNames<Services>}:${string}`
  | ServicesNames<Services>

export type ServiceInstanceName<
  Services extends ServicesConfig,
  Name extends ServicesNames<Services>,
> = Name | `${Name}:${string}`

export type ServiceFromInstanceName<
  Services extends ServicesConfig,
  Name extends ServicesInstancesNames<Services>,
> = Name extends `${infer Service extends ServicesNames<Services>}:${string}`
  ? Service
  : Name extends ServicesNames<Services>
    ? Name
    : never

export type ServiceByArgs<
  Services extends ServicesConfig,
  Name extends ServicesNames<Services>,
  Args extends ServiceArgs<Services, Name>,
> = Services[Name] extends { [key: string]: ServiceDefinition }
  ? Args extends [infer Key extends keyof Services[Name]]
    ? Services[Name][Key]
    : never
  : Services[Name] extends { args: Args }
    ? Services[Name]
    : never

export type ServiceInstance<
  Services extends ServicesConfig,
  Name extends ServicesNames<Services>,
  Args extends ServiceArgs<Services, Name>,
> = ServiceByArgs<Services, Name, Args> extends { instance: infer Instance } ? Instance : never

export type ServiceArgs<Services extends ServicesConfig, Name extends ServicesNames<Services>> =
  Services[Name] extends ServiceDefinition<infer Args>
    ? Args
    : Services[Name] extends { [key: string]: ServiceDefinition<infer Args> }
      ? Args
      : []

export type ServiceEvents<
  Services extends ServicesConfig,
  Name extends ServicesNames<Services>,
  Args extends ServiceArgs<Services, Name>,
> = ServiceByArgs<Services, Name, Args>['events'] extends object
  ? ServiceByArgs<Services, Name, Args>['events']
  : {
      create: ServiceArgs<Services, Name>
      destroy: []
    }

export type ServiceEventsNames<
  Services extends ServicesConfig,
  Name extends ServicesNames<Services>,
  Args extends ServiceArgs<Services, Name>,
> = Exclude<keyof ServiceEvents<Services, Name, Args>, symbol | number>

export type ServiceEventsArgs<
  Services extends ServicesConfig,
  Name extends ServicesNames<Services>,
  Args extends ServiceArgs<Services, Name>,
  Event extends ServiceEventsNames<Services, Name, Args>,
> = ServiceEvents<Services, Name, Args>[Event] extends any[]
  ? ServiceEvents<Services, Name, Args>[Event]
  : []

export type ServicesEventsNames<Services extends ServicesConfig> = {
  [K in ServicesNames<Services>]: ServiceEventsNames<Services, K, ServiceArgs<Services, K>>
}
